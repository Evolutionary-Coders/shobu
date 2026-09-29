import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ARENA_SCENERY_MANIFEST,
  type ArenaSceneryManifest,
  parseArenaSceneryManifest,
  sceneryMatchesLayout,
} from './arenaScenery.ts'
import { ICHIBAN_GAI_BLOCKOUT } from './ichibanGai.ts'
import { layoutFingerprint } from './layoutFingerprint.ts'

const PUBLIC_ARENA = new URL('../../public/assets/arena/', import.meta.url)

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

/**
 * A tranca entre a colisão e a arte (ADR 0010): mexer em `ichibanGai.ts` sem
 * rodar `npm run build:arena-art` reprova aqui, no CI, e não na frente do
 * jogador — que veria o greybox no lugar da arte sem saber por quê.
 */
describe('a arte publicada', () => {
  const manifestUrl = new URL(ARENA_SCENERY_MANIFEST, PUBLIC_ARENA)
  const manifest = parseArenaSceneryManifest(JSON.parse(readFileSync(manifestUrl, 'utf8')))

  it('foi construída com o layout de agora', () => {
    expect(manifest.fingerprint).toBe(layoutFingerprint(ICHIBAN_GAI_BLOCKOUT))
  })

  it('tem o glb e o lightmap que o manifesto promete', () => {
    expect(existsSync(new URL(manifest.glb, PUBLIC_ARENA))).toBe(true)
    expect(existsSync(new URL(manifest.lightmap, PUBLIC_ARENA))).toBe(true)
  })
})
