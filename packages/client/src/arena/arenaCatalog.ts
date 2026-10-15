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
import type { ArenaLayout, Vec3 } from '@shobu/core'
import type { ArenaLightingSpec } from '../renderer/arenaLightingSpec.ts'
import type { ArenaFogSpec } from './arenaFogSpec.ts'
import type { DaySkySpec } from './daySky.ts'
import { ICHIBAN_GAI_MAP } from './ichibanGaiMap.ts'
import { NEON_KAIDO_MAP } from './neonKaidoMap.ts'
import type { RainSpec } from './rainSpec.ts'

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
  /** A chuva presa à câmera (`rainSpec.ts`). Sem ela, o mapa é seco. */
  readonly rain?: RainSpec
}

/**
 * Um mapa do catálogo: o layout do núcleo (colisão, spawns, área de jogo e
 * grafo dos bots, o que o servidor também simula) mais o que só o cliente
 * desenha.
 */
export interface ArenaMap extends ArenaLayout {
  /** O nome que o jogador lê no menu. */
  readonly displayName: string
  /**
   * O manifesto da arte do blender, relativo a `ARENA_SCENERY_DIR`. É ele que
   * aponta o glb e o lightmap, e que diz com que layout a arte foi feita.
   */
  readonly sceneryManifest: string
  atmosphere(): ArenaAtmosphere
}

/**
 * O mapa que abre quando ninguém escolheu outro. Neon-kaidō desde o playtest
 * de 11/10; o Ichiban-gai segue na NOVA PARTIDA.
 */
export const DEFAULT_ARENA_ID = 'neon-kaido'

/**
 * Na ordem em que o menu os lista. O primeiro tem de ser o padrão: o menu
 * guarda a escolha como índice e a partida rápida é o índice 0 — o teste
 * amarra os dois. Trocar a ordem desloca as escolhas já guardadas (quem tinha
 * o índice 0 guardado passou do Ichiban-gai para o Neon-kaidō em 11/10).
 */
export const ARENA_CATALOG: readonly ArenaMap[] = [NEON_KAIDO_MAP, ICHIBAN_GAI_MAP]

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
 * firstSpawnOf(arenaMapById('ichiban-gai')) // [-14, 1.8, 26]
 * ```
 */
export function firstSpawnOf(map: ArenaMap): Vec3 {
  const first = map.spawnPointsM[0]
  if (first) return first
  throw new RangeError(`mapa ${map.id} sem spawn nenhum; esperado 8 pontos`)
}

/** Um mapa como a tela de escolha o mostra: o id que a partida carrega e o rótulo. */
export interface ArenaChoiceOfCatalog {
  readonly id: string
  readonly label: string
}

/**
 * O catálogo na forma que o menu de NOVA PARTIDA lista (`arenaChoices.ts` da
 * frente do menu): na junção, `MATCH_ARENAS` passa a ser isto.
 *
 * ```ts
 * catalogChoices()[0] // { id: 'neon-kaido', label: 'NEON-KAIDŌ' }
 * ```
 */
export function catalogChoices(
  catalog: readonly ArenaMap[] = ARENA_CATALOG,
): readonly ArenaChoiceOfCatalog[] {
  return catalog.map((map) => ({ id: map.id, label: map.displayName.toUpperCase() }))
}

/**
 * O mapa pedido na url (`?arena=ichiban-gai`), ou o padrão. Id que o catálogo
 * não tem cai no padrão — a url vem de fora, e um link velho não pode impedir
 * o jogo de abrir —, mas quem o pediu fica sabendo pelo `unknown`.
 *
 * ```ts
 * arenaIdFromSearch('?arena=ichiban-gai') // { id: 'ichiban-gai' }
 * ```
 */
export function arenaIdFromSearch(
  search: string,
  catalog: readonly ArenaMap[] = ARENA_CATALOG,
): { readonly id: string; readonly unknown?: string } {
  const asked = new URLSearchParams(search).get('arena')
  if (asked === null) return { id: DEFAULT_ARENA_ID }
  if (catalog.some((map) => map.id === asked)) return { id: asked }
  return { id: DEFAULT_ARENA_ID, unknown: asked }
}

/**
 * O mapa que o boot monta: o da url, se ela pediu um; senão o último que a
 * NOVA PARTIDA escolheu. É o que faz o COMEÇAR num mapa diferente do montado
 * funcionar — o menu guarda a escolha, a página recarrega, e o boot já sobe
 * a cena certa.
 *
 * ```ts
 * bootArenaIdOf('', 'ichiban-gai') // { id: 'ichiban-gai' }
 * ```
 */
export function bootArenaIdOf(
  search: string,
  savedId: string,
  catalog: readonly ArenaMap[] = ARENA_CATALOG,
): { readonly id: string; readonly unknown?: string } {
  if (new URLSearchParams(search).has('arena')) return arenaIdFromSearch(search, catalog)
  return arenaIdFromSearch(`?arena=${encodeURIComponent(savedId)}`, catalog)
}
