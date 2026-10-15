import { ICHIBAN_GAI_BLOCKOUT } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  type ArenaSceneryManifest,
  GROUND_MIN_ANISOTROPY,
  parseArenaSceneryManifest,
  sceneryGlows,
  sceneryMatchesLayout,
  sceneryMaterialKind,
  sceneryMinAnisotropy,
  textureAnisotropy,
} from './arenaScenery.ts'
import { layoutFingerprint } from './layoutFingerprint.ts'

const VALID = {
  fingerprint: 'abcd1234',
  glb: 'ichiban-gai.glb',
  lightmap: 'ichiban-gai-lightmap.webp',
  lightmapLevel: 2,
  triangles: 1200,
}

describe('parseArenaSceneryManifest', () => {
  it('lê o manifesto que o build do blender grava', () => {
    expect(parseArenaSceneryManifest({ ...VALID, exposure: 0.4, blender: '5.2.1' })).toEqual(VALID)
  })

  it.each([null, 'texto', 3])('recusa %j, que não é objeto', (raw) => {
    expect(() => parseArenaSceneryManifest(raw)).toThrow(/esperado um objeto/)
  })

  it('recusa texto vazio ou ausente, dizendo o campo', () => {
    expect(() => parseArenaSceneryManifest({ ...VALID, glb: '' })).toThrow(/glb recebeu ""/)
    expect(() => parseArenaSceneryManifest({ ...VALID, lightmap: undefined })).toThrow(
      /lightmap recebeu undefined/,
    )
  })

  it('recusa número que não é positivo, dizendo o campo', () => {
    expect(() => parseArenaSceneryManifest({ ...VALID, lightmapLevel: 0 })).toThrow(
      /lightmapLevel recebeu 0/,
    )
    expect(() => parseArenaSceneryManifest({ ...VALID, triangles: '9' })).toThrow(
      /triangles recebeu "9"/,
    )
  })
})

describe('sceneryMaterialKind', () => {
  it.each([
    ['sup-asfalto', 'baked'],
    ['neon-magenta', 'neon'],
    ['fundo-fachada', 'lit'],
    ['halo-brilho', 'halo'],
  ] as const)('%s é %s', (name, kind) => {
    expect(sceneryMaterialKind(name)).toBe(kind)
  })

  /** Material sem prefixo é o build e o cliente discordando — melhor quebrar alto que pintar errado. */
  it('recusa material sem prefixo, dizendo o nome e os prefixos', () => {
    expect(() => sceneryMaterialKind('Material.001')).toThrow(
      /Material.001 sem prefixo conhecido; esperado sup-, neon-, fundo-, halo-/,
    )
  })
})

describe('sceneryMatchesLayout', () => {
  const current = layoutFingerprint(ICHIBAN_GAI_BLOCKOUT)

  it('aceita a arte construída com o layout de agora', () => {
    const manifest: ArenaSceneryManifest = { ...VALID, fingerprint: current }
    expect(sceneryMatchesLayout(manifest, ICHIBAN_GAI_BLOCKOUT)).toBe(true)
  })

  it('recusa arte de um layout antigo', () => {
    expect(sceneryMatchesLayout(VALID, ICHIBAN_GAI_BLOCKOUT)).toBe(false)
  })
})

describe('sceneryGlows', () => {
  it.each([
    ['neon-letreiros', true],
    ['neon-teloes', true],
    ['neon-cor-magenta', true],
    ['neon-fosco-janelas', false],
    ['neon-fosco-torre', false],
    ['sup-rua', false],
    ['halo-brilho', false],
  ])('%s → %s', (name, glows) => {
    expect(sceneryGlows(name)).toBe(glows)
  })
})

describe('sceneryMinAnisotropy', () => {
  it.each(['sup-rua', 'sup-calcada', 'sup-beco', 'sup-asfalto'])(
    'dá filtro mínimo de 4× ao piso %s, que se vê de raspão',
    (name) => {
      expect(sceneryMinAnisotropy(name)).toBe(GROUND_MIN_ANISOTROPY)
    },
  )

  it.each(['sup-reboco', 'neon-letreiros', 'fundo-rua'])('deixa %s com a predefinição', (name) => {
    expect(sceneryMinAnisotropy(name)).toBe(1)
  })
})

describe('textureAnisotropy', () => {
  it('sobe o filtro de DESEMPENHO até o mínimo do piso', () => {
    expect(textureAnisotropy(1, GROUND_MIN_ANISOTROPY)).toBe(4)
  })

  it('não baixa o filtro de QUALIDADE para o mínimo', () => {
    expect(textureAnisotropy(8, GROUND_MIN_ANISOTROPY)).toBe(8)
  })

  it('usa a predefinição quando a textura não tem mínimo', () => {
    expect(textureAnisotropy(1, undefined)).toBe(1)
  })
})
