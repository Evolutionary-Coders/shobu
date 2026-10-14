import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  GRIP_AHEAD_OF_WRIST_M,
  hideRifle,
  MUZZLE_FLASH_S,
  muzzleFlashOpacity,
  RIFLE_HAND_BONE,
  RIFLE_HOLD_BONES,
  RIFLE_MUZZLE_LOCAL_M,
  rifleGripM,
  rifleMuzzleM,
  rifleUpM,
  writeRifleMatrix,
} from './botRifle.ts'
import { HUMAN_SKINS } from './humanSkins.ts'

const RIFLE_URL = new URL('../../public/assets/character/bot-rifle.glb', import.meta.url)

interface GltfJson {
  readonly nodes: readonly { name?: string; translation?: number[] }[]
  readonly meshes: readonly { primitives: readonly { indices?: number }[] }[]
  readonly accessors: readonly { count: number }[]
}

/** O json de um glb: cabeçalho de 12 bytes, e o primeiro bloco é o json. */
function gltfOf(url: URL): GltfJson {
  const bytes = readFileSync(url)
  const length = bytes.readUInt32LE(12)
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as GltfJson
}

function zero() {
  return { x: 0, y: 0, z: 0 }
}

describe('o bot-rifle.glb', () => {
  const rifle = gltfOf(RIFLE_URL)

  /** Uma malha para os três bots, e barata: o pedido era menos de 1,5 mil triângulos. */
  it('tem menos de 1500 triângulos', () => {
    const triangles = rifle.meshes
      .flatMap((mesh) => mesh.primitives)
      .reduce(
        (sum, primitive) => sum + (rifle.accessors[primitive.indices ?? -1]?.count ?? 0) / 3,
        0,
      )
    expect(triangles).toBeGreaterThan(0)
    expect(triangles).toBeLessThan(1500)
  })

  /**
   * O glTF é de mão direita e o babylon de mão esquerda: o carregador inverte
   * o x. Com a boca do cano no plano do meio (x = 0), os dois concordam.
   */
  it('a boca do cano do arquivo é a que o cliente usa', () => {
    const muzzle = rifle.nodes.find((node) => node.name === 'Muzzle')
    const [x, y, z] = muzzle?.translation ?? []
    expect([x, y, z].map((value) => Number(value?.toFixed(4)))).toEqual([
      RIFLE_MUZZLE_LOCAL_M.x,
      RIFLE_MUZZLE_LOCAL_M.y,
      RIFLE_MUZZLE_LOCAL_M.z,
    ])
  })
})

describe.each(HUMAN_SKINS)('o acoplamento com o humano $id', (skin) => {
  const names = new Set(
    gltfOf(new URL(`../../public${skin.modelUrl}`, import.meta.url)).nodes.map((node) => node.name),
  )

  /** Trocar o boneco sem estes ossos deixa o rifle flutuando: o teste diz qual falta. */
  it('o humano tem o osso da mão e todos os ossos da pose de empunhar', () => {
    const missing = [RIFLE_HAND_BONE, ...RIFLE_HOLD_BONES].filter((bone) => !names.has(bone))
    expect(missing).toEqual([])
  })
})

describe('rifleUpM', () => {
  it('mirando no plano, o cima é o do mundo', () => {
    const up = rifleUpM({ x: 0, y: 0, z: 1 }, zero())
    expect([up.x, up.y, up.z].map((value) => value + 0)).toEqual([0, 1, 0])
  })

  it('mirando para baixo, o cima inclina para a frente, perpendicular à mira', () => {
    const aim = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }
    const up = rifleUpM(aim, zero())
    expect(up.x * aim.x + up.y * aim.y + up.z * aim.z).toBeCloseTo(0)
    expect(up.z).toBeGreaterThan(0)
    expect(up.y).toBeGreaterThan(0)
  })

  it('mirando reto para cima ou para baixo, não divide por zero', () => {
    expect(rifleUpM({ x: 0, y: 1, z: 0 }, zero())).toEqual({ x: 0, y: 0, z: -1 })
    expect(rifleUpM({ x: 0, y: -1, z: 0 }, zero())).toEqual({ x: 0, y: 0, z: 1 })
  })
})

describe('rifleGripM', () => {
  it('é a mão mais um palmo na direção da mira', () => {
    expect(rifleGripM({ x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 1 }, zero())).toEqual({
      x: 1,
      y: 1,
      z: 1 + GRIP_AHEAD_OF_WRIST_M,
    })
  })
})

describe('rifleMuzzleM', () => {
  it('a boca do cano fica à frente do punho, na mira, e um pouco acima', () => {
    const muzzle = rifleMuzzleM({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, zero(), zero())
    expect(muzzle.x).toBeCloseTo(RIFLE_MUZZLE_LOCAL_M.z)
    expect(muzzle.y).toBeCloseTo(1 + RIFLE_MUZZLE_LOCAL_M.y)
    expect(muzzle.z).toBeCloseTo(0)
  })
})

describe('muzzleFlashOpacity', () => {
  it('cheio no tiro, some em linha reta', () => {
    expect([MUZZLE_FLASH_S, MUZZLE_FLASH_S / 2, 0, -1].map(muzzleFlashOpacity)).toEqual([
      1, 0.5, 0, 0,
    ])
  })
})

describe('writeRifleMatrix', () => {
  /** O vetor linha vezes a matriz, como o babylon transforma um ponto. */
  function transform(
    buffer: Float32Array,
    index: number,
    point: { x: number; y: number; z: number },
  ) {
    const m = buffer.subarray(index * 16, index * 16 + 16)
    const at = (column: number) =>
      point.x * (m[column] ?? 0) +
      point.y * (m[4 + column] ?? 0) +
      point.z * (m[8 + column] ?? 0) +
      (m[12 + column] ?? 0)
    return { x: at(0), y: at(1), z: at(2) }
  }

  it('leva o punho ao ponto pedido e a boca do cano para onde a mira aponta', () => {
    const buffer = new Float32Array(32)
    const grip = { x: 2, y: 1, z: 3 }
    const aim = { x: 1, y: 0, z: 0 }
    writeRifleMatrix(buffer, 1, grip, aim, zero())
    const origin = transform(buffer, 1, zero())
    const muzzle = transform(buffer, 1, RIFLE_MUZZLE_LOCAL_M)
    const expected = rifleMuzzleM(grip, aim, zero(), zero())
    expect([origin.x, origin.y, origin.z]).toEqual([2, 1, 3])
    expect(muzzle.x).toBeCloseTo(expected.x)
    expect(muzzle.y).toBeCloseTo(expected.y)
    expect(muzzle.z).toBeCloseTo(expected.z)
  })

  /** De mão esquerda: olhando para +z, a direita do rifle é +x — a alavanca do ferrolho fica à direita. */
  it('mirando para +z, a direita do rifle é o +x do mundo', () => {
    const buffer = new Float32Array(16)
    writeRifleMatrix(buffer, 0, zero(), { x: 0, y: 0, z: 1 }, zero())
    expect(transform(buffer, 0, { x: 1, y: 0, z: 0 })).toEqual({ x: 1, y: 0, z: 0 })
  })
})

describe('hideRifle', () => {
  it('zera só a matriz do rifle pedido', () => {
    const buffer = new Float32Array(32).fill(1)
    hideRifle(buffer, 1)
    expect([buffer[15], buffer[16], buffer[31]]).toEqual([1, 0, 0])
  })
})
