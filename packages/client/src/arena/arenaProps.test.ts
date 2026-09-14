import { readFileSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { maxDoubleJumpHeightM, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { ALLEY_KIT_SIZE_M, ARENA_PROPS, propWorldSizeM } from './arenaProps.ts'
import { GREYBOX_BLOCKOUT } from './greyboxBlockout.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const KIT_URL = new URL('../../public/assets/props/alley-kit.glb', import.meta.url)

const propBlocks = GREYBOX_BLOCKOUT.filter((block) => block.layer === 'prop')

/**
 * O kit publicado, lido uma vez: são 56 kB e duas malhas. As extensões vão
 * registradas porque a trimsheet de origem usa `KHR_texture_transform` para
 * mapear a peça na folha, e sem ela o leitor recusa o arquivo.
 */
const kit = await new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .readBinary(new Uint8Array(readFileSync(KIT_URL)))
const kitSizeByName = new Map(
  kit
    .getRoot()
    .listNodes()
    .map((node) => {
      const position = node.getMesh()?.listPrimitives()[0]?.getAttribute('POSITION')
      const min: readonly number[] = position?.getMin([]) ?? []
      const max: readonly number[] = position?.getMax([]) ?? []
      return [node.getName(), max.map((high, axis) => high - (min[axis] ?? 0))] as const
    }),
)

describe('ARENA_PROPS', () => {
  it('põe algum prop, senão o resto do arquivo passaria vazio', () => {
    expect(ARENA_PROPS.length).toBeGreaterThan(0)
  })

  it('dá nome único a cada prop, porque o nome é o que se procura no inspector', () => {
    const names = ARENA_PROPS.map((prop) => prop.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('só gira em quarto de volta', () => {
    for (const prop of ARENA_PROPS) {
      expect(() => propWorldSizeM(prop.kitMesh, prop.yawRad)).not.toThrow()
    }
  })
})

/**
 * O teste que este arquivo existe para ter. Prop é a única coisa da arena
 * descrita em dois lugares — a malha que se vê e a caixa que para a bala — e
 * as duas saem de `ARENA_PROPS`. Se alguém mover uma sem a outra, o jogador
 * descobre mirando no condensador e vendo o rastro passar reto.
 */
describe('o prop que se vê é a caixa que para a bala', () => {
  it('leva todo prop para o blockout', () => {
    expect(propBlocks).toHaveLength(ARENA_PROPS.length)
  })

  it.each(ARENA_PROPS.map((prop) => [prop.name, prop] as const))(
    '%s tem bloco no mesmo centro e no mesmo tamanho',
    (name, prop) => {
      const block = propBlocks.find((candidate) => candidate.name === name)
      expect(block, `${name} não chegou ao blockout`).toBeDefined()
      expect(block?.centerM).toEqual(prop.centerM)
      expect(block?.sizeM).toEqual(propWorldSizeM(prop.kitMesh, prop.yawRad))
    },
  )
})

/**
 * A outra ponta da mesma corda: o tamanho que vira caixa de colisão é copiado
 * à mão do relatório do conversor. Reconverter o kit com outra peça e esquecer
 * de atualizar `ALLEY_KIT_SIZE_M` daria caixa do tamanho errado, e nenhum
 * outro teste olharia.
 */
describe('ALLEY_KIT_SIZE_M bate com o glb publicado', () => {
  it.each(Object.entries(ALLEY_KIT_SIZE_M))('%s tem o tamanho declarado', (name, declared) => {
    const measured = kitSizeByName.get(name)
    expect(measured, `o kit não tem a malha '${name}'`).toBeDefined()
    for (const [axis, side] of declared.entries()) {
      expect(measured?.[axis]).toBeCloseTo(side, 3)
    }
  })
})

describe('propWorldSizeM', () => {
  it('devolve o tamanho do kit sem giro', () => {
    expect(propWorldSizeM('condenser-wide', 0)).toEqual(ALLEY_KIT_SIZE_M['condenser-wide'])
  })

  it('troca largura por profundidade no quarto de volta', () => {
    const [width, height, depth] = ALLEY_KIT_SIZE_M['condenser-wide']
    expect(propWorldSizeM('condenser-wide', Math.PI / 2)).toEqual([depth, height, width])
  })

  it('volta ao original na meia-volta', () => {
    expect(propWorldSizeM('condenser-narrow', Math.PI)).toEqual(
      ALLEY_KIT_SIZE_M['condenser-narrow'],
    )
  })

  it('recusa giro que não é quarto de volta, com o valor recebido', () => {
    expect(() => propWorldSizeM('condenser-wide', 0.4)).toThrow(/recebeu 0.4/)
  })
})

/**
 * Prop é decoração com colisão, e colisão muda level design. Estes dois testes
 * são a fronteira: o que está no muro tem que continuar inalcançável, e nenhum
 * prop pode encostar numa cobertura do chão — a margem de 2,2 m contra os
 * 2,68 m do pulo duplo é decisão de level design, e não se mexe de lado.
 */
describe('nenhum prop mexe no envelope de movimentação', () => {
  const reachM = maxDoubleJumpHeightM(config)

  it('deixa o prop do muro fora do alcance do pulo duplo', () => {
    const onWalls = ARENA_PROPS.filter((prop) => prop.name.startsWith('prop-wall-'))
    expect(onWalls.length).toBeGreaterThan(0)
    for (const prop of onWalls) {
      const bottomM = prop.centerM[1] - propWorldSizeM(prop.kitMesh, prop.yawRad)[1] / 2
      expect(
        bottomM,
        `${prop.name} começa em ${bottomM} e o alcance é ${reachM.toFixed(2)}`,
      ).toBeGreaterThan(reachM)
    }
  })

  it('não encosta em nenhuma cobertura do chão', () => {
    const covers = GREYBOX_BLOCKOUT.filter((block) => block.layer === 'ground')
    expect(covers.length).toBeGreaterThan(0)
    for (const prop of ARENA_PROPS) {
      const size = propWorldSizeM(prop.kitMesh, prop.yawRad)
      for (const cover of covers) {
        expect(
          overlaps(prop.centerM, size, cover.centerM, cover.sizeM),
          `${prop.name} x ${cover.name}`,
        ).toBe(false)
      }
    }
  })
})

function overlaps(
  centerA: readonly number[],
  sizeA: readonly number[],
  centerB: readonly number[],
  sizeB: readonly number[],
): boolean {
  return [0, 1, 2].every((axis) => {
    const gap = Math.abs((centerA[axis] ?? 0) - (centerB[axis] ?? 0))
    return gap < ((sizeA[axis] ?? 0) + (sizeB[axis] ?? 0)) / 2 - Number.EPSILON
  })
}
