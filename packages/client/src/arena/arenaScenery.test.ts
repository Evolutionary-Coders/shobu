import { describe, expect, it } from 'vitest'
import {
  type ArenaSceneryManifest,
  parseArenaSceneryManifest,
  sceneryMatchesLayout,
  sceneryMaterialKind,
} from './arenaScenery.ts'
import { ICHIBAN_GAI_BLOCKOUT } from './ichibanGai.ts'
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
  ] as const)('%s é %s', (name, kind) => {
    expect(sceneryMaterialKind(name)).toBe(kind)
  })

  /** Material sem prefixo é o build e o cliente discordando — melhor quebrar alto que pintar errado. */
  it('recusa material sem prefixo, dizendo o nome e os prefixos', () => {
    expect(() => sceneryMaterialKind('Material.001')).toThrow(
      /Material.001 sem prefixo conhecido; esperado sup-, neon-, fundo-/,
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
