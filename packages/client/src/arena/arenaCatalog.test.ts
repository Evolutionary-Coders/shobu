import { existsSync, readFileSync } from 'node:fs'
import { isInsidePlayArea } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  ARENA_CATALOG,
  type ArenaMap,
  arenaIdFromSearch,
  arenaMapById,
  bootArenaIdOf,
  catalogChoices,
  DEFAULT_ARENA_ID,
  firstSpawnOf,
} from './arenaCatalog.ts'
import { parseArenaSceneryManifest } from './arenaScenery.ts'
import { layoutFingerprint } from './layoutFingerprint.ts'

const PUBLIC_ARENA = new URL('../../public/assets/arena/', import.meta.url)

describe('ARENA_CATALOG', () => {
  it('tem ids únicos, em minúsculas e sem espaço', () => {
    const ids = ARENA_CATALOG.map((map) => map.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('tem o mapa padrão', () => {
    expect(arenaMapById(DEFAULT_ARENA_ID).id).toBe(DEFAULT_ARENA_ID)
  })
})

describe.each(ARENA_CATALOG.map((map) => [map.id, map] as const))('o mapa %s', (_id, map) => {
  it('tem oito spawns, todos dentro da área de jogo', () => {
    expect(map.spawnPointsM).toHaveLength(8)
    for (const [x, , z] of map.spawnPointsM) {
      expect(isInsidePlayArea(map.playArea, { x, y: 0, z })).toBe(true)
    }
  })

  it('tem um grafo de bots com pontos', () => {
    expect(map.navGraph().nodes.length).toBeGreaterThan(0)
  })

  it('tem céu, névoa e luz', () => {
    const { sky, fog, lighting } = map.atmosphere()
    expect(fog.colorRgb).toHaveLength(3)
    expect(sky.horizonRgb).toHaveLength(3)
    expect(lighting.key.intensity).toBeGreaterThan(0)
  })

  /**
   * A tranca entre a colisão e a arte (ADR 0010), agora por mapa: mexer no
   * layout sem refazer a arte reprova aqui, no CI, e não na frente do jogador
   * — que veria o greybox no lugar da arte sem saber por quê.
   */
  it('tem a arte publicada, feita com o layout de agora', () => {
    const manifestUrl = new URL(map.sceneryManifest, PUBLIC_ARENA)
    const manifest = parseArenaSceneryManifest(JSON.parse(readFileSync(manifestUrl, 'utf8')))
    expect(manifest.fingerprint).toBe(layoutFingerprint(map.blockout))
    expect(existsSync(new URL(manifest.glb, PUBLIC_ARENA))).toBe(true)
    expect(existsSync(new URL(manifest.lightmap, PUBLIC_ARENA))).toBe(true)
  })
})

describe('arenaMapById', () => {
  it('acha o Ichiban-gai pelo id', () => {
    expect(arenaMapById('ichiban-gai').displayName).toBe('Ichiban-gai')
  })

  it('recusa id desconhecido, com o id e a lista do que existe', () => {
    expect(() => arenaMapById('de_dust2')).toThrow(
      /mapa "de_dust2" não está no catálogo; esperado um de: ichiban-gai/,
    )
  })

  it('procura no catálogo que recebe', () => {
    const other: ArenaMap = { ...arenaMapById('ichiban-gai'), id: 'outro' }
    expect(arenaMapById('outro', [other])).toBe(other)
  })
})

describe('firstSpawnOf', () => {
  it('é o primeiro spawn do mapa', () => {
    const map = arenaMapById('ichiban-gai')
    expect(firstSpawnOf(map)).toBe(map.spawnPointsM[0])
  })

  it('recusa mapa sem spawn', () => {
    const empty: ArenaMap = { ...arenaMapById('ichiban-gai'), id: 'vazio', spawnPointsM: [] }
    expect(() => firstSpawnOf(empty)).toThrow(/mapa vazio sem spawn nenhum; esperado 8 pontos/)
  })
})

describe('catalogChoices', () => {
  it('lista os mapas do catálogo com o rótulo em caixa alta, na ordem', () => {
    expect(catalogChoices()).toEqual([
      { id: 'ichiban-gai', label: 'ICHIBAN-GAI' },
      { id: 'neon-kaido', label: 'NEON-KAIDŌ' },
    ])
  })
})

describe('arenaIdFromSearch', () => {
  it('sem pedido, é o mapa padrão', () => {
    expect(arenaIdFromSearch('')).toEqual({ id: DEFAULT_ARENA_ID })
  })

  it('lê o id pedido na url', () => {
    expect(arenaIdFromSearch('?perf=1&arena=neon-kaido')).toEqual({ id: 'neon-kaido' })
  })

  it('id desconhecido cai no padrão e diz qual era', () => {
    expect(arenaIdFromSearch('?arena=de_dust2')).toEqual({
      id: DEFAULT_ARENA_ID,
      unknown: 'de_dust2',
    })
  })
})

describe('bootArenaIdOf', () => {
  it('sem pedido na url, sobe o mapa que a nova partida guardou', () => {
    expect(bootArenaIdOf('?perf=1', 'neon-kaido')).toEqual({ id: 'neon-kaido' })
  })

  it('a url vence a escolha guardada', () => {
    expect(bootArenaIdOf('?arena=ichiban-gai', 'neon-kaido')).toEqual({ id: 'ichiban-gai' })
  })

  it('escolha guardada de um mapa que esta versão não tem cai no padrão', () => {
    expect(bootArenaIdOf('', 'velho')).toEqual({ id: DEFAULT_ARENA_ID, unknown: 'velho' })
  })
})
