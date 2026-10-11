/**
 * O catálogo de mapas: tudo o que muda de uma arena para outra, num registro
 * só por mapa. O jogo escolhe um registro e o resto — colisão, spawns, área de
 * jogo, grafo dos bots, arte do blender, céu, névoa e luz — vem dele, sem que
 * nenhum outro módulo saiba o nome do mapa.
 *
 * Era um mapa só, com o nome dele importado em seis lugares do cliente; a
 * segunda arena (o look-dev cyberpunk de 11/10) teria de trocar cada import à
 * mão, e o menu de "Nova Partida" não teria o que listar.
 *
 * Dado puro: não importa a engine. Quem traduz o registro para o babylon é o
 * renderer, e o teste de cada mapa é o do próprio layout.
 */
import type { NavGraph, PlayArea } from '@shobu/core'
import type { ArenaLightingSpec } from '../renderer/arenaLightingSpec.ts'
import type { GreyboxBlock, Vec3 } from './arenaBlock.ts'
import type { ArenaFogSpec } from './arenaFogSpec.ts'
import type { DaySkySpec } from './daySky.ts'
import { ICHIBAN_GAI_MAP } from './ichibanGaiMap.ts'

/**
 * O céu, a névoa e a luz dinâmica de um mapa. Os três andam juntos porque são
 * amarrados entre si — a névoa desbota para o horizonte do céu, e a luz do
 * personagem é o sol do céu —, e trocar um sem os outros devolveria o
 * competidor com a sombra do lado errado do prédio.
 */
export interface ArenaAtmosphere {
  readonly sky: DaySkySpec
  readonly fog: ArenaFogSpec
  readonly lighting: ArenaLightingSpec
}

export interface ArenaMap {
  /** Estável e em minúsculas: é o que se guarda e o que se passa por url. */
  readonly id: string
  /** O nome que o jogador lê no menu. */
  readonly displayName: string
  /** As caixas que são, ao mesmo tempo, colisão e alvo do tiro (ADR 0010). */
  readonly blockout: readonly GreyboxBlock[]
  /** Os oito spawns, na convenção de olho. O primeiro é onde o jogador nasce sem servidor. */
  readonly spawnPointsM: readonly Vec3[]
  /** O retângulo que a regra de fora da área vigia (ADR 0011). */
  readonly playArea: PlayArea
  /** Por onde os bots andam (ADR 0016). Função porque o grafo é montado, não constante. */
  navGraph(): NavGraph
  /**
   * O manifesto da arte do blender, relativo a `ARENA_SCENERY_DIR`. É ele que
   * aponta o glb e o lightmap, e que diz com que layout a arte foi feita.
   */
  readonly sceneryManifest: string
  atmosphere(): ArenaAtmosphere
}

/** O mapa que abre quando ninguém escolheu outro. */
export const DEFAULT_ARENA_ID = 'ichiban-gai'

/** Na ordem em que o menu os lista. */
export const ARENA_CATALOG: readonly ArenaMap[] = [ICHIBAN_GAI_MAP]

/**
 * O mapa de um id. Id desconhecido é erro, e não o mapa padrão: escolha que
 * cai em outro mapa em silêncio é o jogador entrando onde não pediu.
 *
 * ```ts
 * arenaMapById('ichiban-gai').displayName // 'Ichiban-gai'
 * ```
 */
export function arenaMapById(id: string, catalog: readonly ArenaMap[] = ARENA_CATALOG): ArenaMap {
  const found = catalog.find((map) => map.id === id)
  if (found) return found
  const known = catalog.map((map) => map.id).join(', ')
  throw new RangeError(`mapa ${JSON.stringify(id)} não está no catálogo; esperado um de: ${known}`)
}

/**
 * Onde o jogador nasce quando não há servidor para sortear: o primeiro spawn.
 *
 * ```ts
 * firstSpawnOf(arenaMapById(DEFAULT_ARENA_ID)) // [-14, 1.8, 26]
 * ```
 */
export function firstSpawnOf(map: ArenaMap): Vec3 {
  const first = map.spawnPointsM[0]
  if (first) return first
  throw new RangeError(`mapa ${map.id} sem spawn nenhum; esperado 8 pontos`)
}
