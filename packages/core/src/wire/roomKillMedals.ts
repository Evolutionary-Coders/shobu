import type { MedalAward } from '../medals/awardMedals.ts'
import { MEDAL_CATALOG, type MedalSlug } from '../medals/medalCatalog.ts'
import type { KillEvent } from '../scoring/killEvent.ts'

/**
 * Uma medalha que a sala concedeu, como ela viaja no fio: o slug e os pontos
 * já descontados da escada de multikill. A raridade e o rótulo o cliente tira
 * do próprio catálogo.
 */
export interface RoomMedal {
  readonly slug: MedalSlug
  readonly points: number
}

/**
 * A kill da sala com as medalhas que o placar oficial deu a ela (ADR 0031).
 * `medals` é opcional para o cliente novo seguir falando com um servidor que
 * ainda não as manda: sem elas, o cliente volta a decidir pelo placar dele.
 */
export interface RoomKillMessage extends KillEvent {
  readonly medals?: readonly RoomMedal[]
}

const BY_SLUG = new Map(MEDAL_CATALOG.map((medal) => [medal.slug as string, medal]))

/**
 * As medalhas do fio de volta para `MedalAward`, no fim de `into`. Devolve
 * `false` quando a mensagem não trouxe medalha nenhuma — servidor antigo —, e
 * quem chama decide pelo placar local. Um slug que este cliente não conhece
 * (servidor mais novo) fica de fora em vez de derrubar o quadro: o
 * `medalBySlug` lança.
 *
 * ```ts
 * if (!roomMedalAwards(kill.medals, awards)) recordKill(board, kill, config, awards)
 * ```
 */
export function roomMedalAwards(
  raw: readonly RoomMedal[] | undefined,
  into: MedalAward[],
): boolean {
  if (!raw) return false
  for (const { slug, points } of raw) {
    const medal = BY_SLUG.get(slug)
    if (medal) into.push({ medal, points })
  }
  return true
}

/**
 * As medalhas de uma kill para o fio, na ordem em que a sala as concedeu.
 *
 * ```ts
 * room.broadcast(KILL_MESSAGE, { ...kill, medals: roomMedalsOf(room.medals) })
 * ```
 */
export function roomMedalsOf(awards: readonly MedalAward[]): RoomMedal[] {
  return awards.map((award) => ({ slug: award.medal.slug, points: award.points }))
}
