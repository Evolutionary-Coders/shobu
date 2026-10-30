import type { ScorestreaksConfig } from '../config/gameplayConfig.ts'
import type { KillEvent } from '../scoring/killEvent.ts'
import type { Scoreboard } from '../scoring/scoreboard.ts'
import type { ScorestreakSlug } from './scorestreakCatalog.ts'
import {
  createScorestreakSlots,
  earnScorestreaks,
  forgetScorestreakLife,
  resetScorestreakSlots,
  type ScorestreakSlots,
  spendScorestreak,
} from './scorestreakSlots.ts'

/** `earned` é a série que ficou pronta; `activated`, a que foi acionada. */
export type ScorestreakNoticeKind = 'earned' | 'activated'

/**
 * O que aconteceu com uma série neste tick. A sala transforma o aviso em
 * mensagem de rede; o cliente offline, em texto no hud.
 */
export interface ScorestreakNotice {
  readonly kind: ScorestreakNoticeKind
  readonly playerId: string
  readonly slot: number
  readonly scorestreak: ScorestreakSlug
}

/**
 * As séries de todos os combatentes de uma partida (ADR 0029). O mesmo livro
 * serve a sala do servidor e a partida offline do cliente: quem chama decide
 * se está vivo, e o livro só decide o que se ganha e o que se gasta.
 */
export interface ScorestreakLedger {
  readonly slotsById: Map<string, ScorestreakSlots>
  /** Quem aciona a série assim que a ganha: os bots. */
  readonly autoSpenders: Set<string>
  /** Rascunho de `earnScorestreaks`, reaproveitado: uma kill por tick não aloca. */
  readonly earned: number[]
}

/**
 * O livro vazio, sem ninguém inscrito.
 *
 * ```ts
 * const ledger = createScorestreakLedger()
 * ```
 */
export function createScorestreakLedger(): ScorestreakLedger {
  return { slotsById: new Map(), autoSpenders: new Set(), earned: [] }
}

/**
 * Inscreve o combatente com as séries que ele levou, no lugar das que tinha.
 * `autoSpend` é o bot: ele aciona cada série no tick em que a ganha.
 *
 * ```ts
 * enlistScorestreaks(ledger, 'bot-0', pickBotScorestreaks(MATCH_SEED_BASE, 0), true)
 * ```
 */
export function enlistScorestreaks(
  ledger: ScorestreakLedger,
  playerId: string,
  loadout: readonly ScorestreakSlug[],
  autoSpend = false,
): ScorestreakSlots {
  const slots = createScorestreakSlots(loadout)
  ledger.slotsById.set(playerId, slots)
  if (autoSpend) ledger.autoSpenders.add(playerId)
  else ledger.autoSpenders.delete(playerId)
  return slots
}

/**
 * Tira o combatente do livro: saiu da sala, ou deixou de ser nosso.
 *
 * ```ts
 * dropScorestreaks(ledger, client.sessionId)
 * ```
 */
export function dropScorestreaks(ledger: ScorestreakLedger, playerId: string): void {
  ledger.slotsById.delete(playerId)
  ledger.autoSpenders.delete(playerId)
}

/**
 * A kill depois de pontuada (`recordKill`): a vítima pode ganhar tudo de novo
 * na vida seguinte, e o atirador ganha o que os pontos da vida pagam. Para o
 * bot, a série ganha já sai acionada. Os avisos vão para `into`; quem não
 * está no livro é ignorado.
 *
 * ```ts
 * recordKill(board, kill, config, medals)
 * creditScorestreakKill(ledger, board, kill, config.scorestreaks, notices)
 * ```
 */
export function creditScorestreakKill(
  ledger: ScorestreakLedger,
  board: Readonly<Scoreboard>,
  kill: Readonly<KillEvent>,
  config: ScorestreaksConfig,
  into: ScorestreakNotice[],
): void {
  forgetScorestreakDeath(ledger, kill.victimId)
  if (kill.shooterId === kill.victimId) return
  const slots = ledger.slotsById.get(kill.shooterId)
  const score = board.players.get(kill.shooterId)
  if (!slots || !score) return
  for (const slot of earnScorestreaks(slots, score.scorestreakPoints, config, ledger.earned)) {
    const scorestreak = slots.loadout[slot] as ScorestreakSlug
    into.push({ kind: 'earned', playerId: kill.shooterId, slot, scorestreak })
    if (ledger.autoSpenders.has(kill.shooterId)) {
      activateScorestreak(ledger, kill.shooterId, slot, into)
    }
  }
}

/**
 * A morte sem atirador (a borda): a vida nova pode ganhar tudo de novo, e o
 * que estava guardado continua.
 *
 * ```ts
 * forgetScorestreakDeath(ledger, playerId)
 * ```
 */
export function forgetScorestreakDeath(ledger: ScorestreakLedger, playerId: string): void {
  const slots = ledger.slotsById.get(playerId)
  if (slots) forgetScorestreakLife(slots)
}

/**
 * Aciona a série do slot, se está pronta, e avisa. Slot fora da faixa, série
 * não pronta ou id fora do livro devolvem `undefined` e não avisam.
 *
 * ```ts
 * activateScorestreak(ledger, playerId, 0, notices) // 'ping'
 * ```
 */
export function activateScorestreak(
  ledger: ScorestreakLedger,
  playerId: string,
  slot: number,
  into: ScorestreakNotice[],
): ScorestreakSlug | undefined {
  const slots = ledger.slotsById.get(playerId)
  if (!slots) return undefined
  const spent = spendScorestreak(slots, slot)
  if (spent) into.push({ kind: 'activated', playerId, slot, scorestreak: spent })
  return spent
}

/**
 * O cliente online não decide nada: marca como pronta a série que a sala diz
 * que ele ganhou (`SCORESTREAK_EARNED_MESSAGE`). Slot fora da faixa, ou que
 * não tem mais aquela série, é ignorado; devolve se marcou, para quem chama
 * só anunciar o ganho que valeu.
 *
 * ```ts
 * confirmScorestreakEarned(ledger, LOCAL_PLAYER_ID, message.slot, message.scorestreak)
 * ```
 */
export function confirmScorestreakEarned(
  ledger: ScorestreakLedger,
  playerId: string,
  slot: number,
  scorestreak: ScorestreakSlug,
): boolean {
  const slots = ledger.slotsById.get(playerId)
  // o aviso pode ter saído da sala antes de a escolha nova chegar lá: o slot
  // que ele aponta já é de outra série, e acender esse slot mentiria.
  if (slots?.loadout[slot] !== scorestreak) return false
  slots.earnedThisLife[slot] = true
  slots.ready[slot] = true
}

/**
 * A partida nova: ninguém tem nada ganho nem guardado, e cada um mantém a escolha.
 *
 * ```ts
 * resetScorestreakLedger(parts.scorestreaks)
 * ```
 */
export function resetScorestreakLedger(ledger: ScorestreakLedger): void {
  for (const slots of ledger.slotsById.values()) resetScorestreakSlots(slots)
}
  return true
