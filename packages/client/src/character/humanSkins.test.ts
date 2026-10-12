import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COMPETITOR_ACCENT_MATERIAL, COMPETITOR_BODY_MATERIAL } from './competitorPalette.ts'
import {
  botSkinsFor,
  DEFAULT_PLAYER_SKIN,
  HUMAN_SKINS,
  type HumanSkinId,
  humanPortraitUrl,
  humanSkinUrl,
  playerSkinFor,
  portraitsOf,
} from './humanSkins.ts'

const PUBLIC = new URL('../../public', import.meta.url)

interface GltfJson {
  readonly nodes: readonly { name?: string }[]
  readonly meshes: readonly { primitives: readonly { indices?: number }[] }[]
  readonly accessors: readonly { count: number }[]
  readonly materials: readonly { name?: string }[]
  readonly images?: readonly { mimeType?: string }[]
  readonly skins?: readonly { joints: readonly number[] }[]
  readonly animations?: readonly { channels: readonly { target: { node?: number } }[] }[]
}

/** O json de um glb: cabeçalho de 12 bytes, e o primeiro bloco é o json. */
function gltfOf(url: string): GltfJson {
  const bytes = readFileSync(new URL(`.${url}`, `${PUBLIC.href}/`))
  const length = bytes.readUInt32LE(12)
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as GltfJson
}

function trianglesOf(gltf: GltfJson): number {
  return gltf.meshes
    .flatMap((mesh) => mesh.primitives)
    .reduce((sum, primitive) => sum + (gltf.accessors[primitive.indices ?? -1]?.count ?? 0) / 3, 0)
}

function jointNamesOf(gltf: GltfJson): string[] {
  return (gltf.skins?.[0]?.joints ?? []).map((index) => gltf.nodes[index]?.name ?? '')
}

function animatedNodesOf(gltf: GltfJson): string[] {
  const targets = (gltf.animations ?? []).flatMap((clip) => clip.channels)
  const names = targets.map((channel) => gltf.nodes[channel.target.node ?? -1]?.name ?? '?')
  return [...new Set(names)]
}

describe('botSkinsFor', () => {
  it('três bots com o jogador de ronin: as outras três, sem repetir', () => {
    expect(botSkinsFor(3, 'ronin')).toEqual(['brick', 'vex', 'nova'])
  })

  it('é determinística: a mesma sala sai igual', () => {
    expect(botSkinsFor(3, 'vex')).toEqual(botSkinsFor(3, 'vex'))
  })

  it('nunca veste um bot com a skin do jogador', () => {
    for (const skin of HUMAN_SKINS) expect(botSkinsFor(6, skin.id)).not.toContain(skin.id)
  })

  it('com mais bots que skins livres, volta ao começo da lista livre', () => {
    expect(botSkinsFor(4, 'nova')).toEqual(['brick', 'vex', 'ronin', 'brick'])
  })

  it('recusa contagem que não é de bots, com o valor na mensagem', () => {
    expect(() => botSkinsFor(-1, 'ronin')).toThrow(/botCount recebeu -1/)
    expect(() => botSkinsFor(1.5, 'ronin')).toThrow(/botCount recebeu 1.5/)
  })
})

describe('portraitsOf', () => {
  it('dá ao jogador o retrato da skin dele e a cada bot o do corpo que ele veste', () => {
    const portraits = portraitsOf('local', 'ronin', ['bot-0', 'bot-1'])
    const [first, second] = botSkinsFor(2, 'ronin')
    expect(portraits.get('local')).toBe(humanPortraitUrl('ronin'))
    expect(portraits.get('bot-0')).toBe(humanPortraitUrl(first as HumanSkinId))
    expect(portraits.get('bot-1')).toBe(humanPortraitUrl(second as HumanSkinId))
  })

  /** O arquivo é o que a EDITAR CLASSE já mostra: tem que existir em `public/`. */
  it.each(HUMAN_SKINS)('o retrato de $id existe', (skin) => {
    const url = humanPortraitUrl(skin.id)
    expect(() => readFileSync(new URL(`../../public${url}`, import.meta.url))).not.toThrow()
  })
})

describe('playerSkinFor', () => {
  it('aceita uma skin do catálogo', () => {
    expect(playerSkinFor('vex')).toBe('vex')
  })

  it('cai na padrão com valor desconhecido ou ausente', () => {
    expect(playerSkinFor('robo')).toBe(DEFAULT_PLAYER_SKIN)
    expect(playerSkinFor(undefined)).toBe(DEFAULT_PLAYER_SKIN)
  })
})

describe('humanSkinUrl', () => {
  it('é o glb da skin', () => {
    expect(humanSkinUrl('nova')).toBe('/assets/character/humans/nova.glb')
  })

  it('recusa skin fora do catálogo dizendo quais existem', () => {
    expect(() => humanSkinUrl('robo' as never)).toThrow(/'robo' fora do catálogo.*brick/)
  })
})

describe('o catálogo', () => {
  it('tem dois homens e duas mulheres, com ids e nomes únicos', () => {
    expect(HUMAN_SKINS).toHaveLength(4)
    expect(new Set(HUMAN_SKINS.map((skin) => skin.id)).size).toBe(4)
    expect(new Set(HUMAN_SKINS.map((skin) => skin.displayName)).size).toBe(4)
  })
})

/**
 * O orçamento por personagem, conferido contra o arquivo que o jogo baixa:
 * quatro deles aparecem ao mesmo tempo no celular.
 */
describe.each(HUMAN_SKINS)('o glb de $id', (skin) => {
  const gltf = gltfOf(skin.modelUrl)
  const clips = gltfOf('/assets/character/competitor-clips.glb')

  it('tem até 15 mil triângulos', () => {
    expect(trianglesOf(gltf)).toBeGreaterThan(5000)
    expect(trianglesOf(gltf)).toBeLessThanOrEqual(15000)
  })

  it('tem os dois materiais que a pintura procura, e só eles', () => {
    expect(gltf.materials.map((material) => material.name).sort()).toEqual(
      [COMPETITOR_ACCENT_MATERIAL, COMPETITOR_BODY_MATERIAL].sort(),
    )
  })

  it('tem um atlas só, em webp', () => {
    expect(gltf.images?.map((image) => image.mimeType)).toEqual(['image/webp'])
  })

  /** Os clipes são reapontados pelo nome do osso: osso faltando é membro parado. */
  it('tem todo osso que os clipes animam', () => {
    const joints = new Set(jointNamesOf(gltf))
    const missing = animatedNodesOf(clips).filter((name) => !joints.has(name))
    expect(missing).toEqual([])
  })
})
