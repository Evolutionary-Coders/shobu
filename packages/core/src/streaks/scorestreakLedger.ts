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
  sameScorestreakLoadout,
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
  /**
   * Só no ECO acionado: quem o dono vê no minimapa (`echoSubjectOf`). Sem
   * ninguém para marcar, o campo não vem, e o ECO sai sem efeito.
   */
  readonly subjectId?: string
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
  /** Vítima → quem a matou por último, nesta partida: o alvo do ECO dela. */
  readonly lastKillerOf: Map<string, string>
  /**
   * Quem já matou alguém nesta partida, da kill mais velha para a mais nova:
   * o alvo do ECO de quem ainda não morreu (`echoSubjectOf`).
   */
  readonly recentKillers: string[]
}

/**
 * O livro vazio, sem ninguém inscrito.
 *
 * ```ts
 * const ledger = createScorestreakLedger()
 * ```
 */
export function createScorestreakLedger(): ScorestreakLedger {
  return {
    slotsById: new Map(),
    autoSpenders: new Set(),
    earned: [],
    lastKillerOf: new Map(),
    recentKillers: [],
  }
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
 * Troca as séries de quem já está no livro, no meio da partida. A série que
 * continua na escolha leva o que tinha — pronta continua pronta, e a já ganha
 * nesta vida não sai de novo —, em qualquer slot que ela vá parar. A série que
 * entra agora, numa vida que já tem pontos, só pode sair na vida seguinte: sem
 * isso, trocar a escolha no meio de uma sequência dava as séries novas de graça
 * com os pontos já feitos. A mesma escolha não mexe em nada.
 *
 * Antes disto a sala inscrevia de novo, e a troca perdia a série pronta e
 * travava todas as outras pelo resto da vida (revisão da fase 1).
 *
 * ```ts
 * rechooseScorestreaks(ledger, playerId, ['ping', 'sonar', 'emp'], score.scorestreakPoints)
 * ```
 */
export function rechooseScorestreaks(
  ledger: ScorestreakLedger,
  playerId: string,
  loadout: readonly ScorestreakSlug[],
  pointsThisLife: number,
): ScorestreakSlots | undefined {
  const previous = ledger.slotsById.get(playerId)
  if (!previous) return undefined
  if (sameScorestreakLoadout(previous.loadout, loadout)) return previous
  const slots = createScorestreakSlots(loadout)
  for (const [index, slug] of loadout.entries()) {
    const kept = previous.loadout.indexOf(slug)
    slots.ready[index] = kept >= 0 && (previous.ready[kept] as boolean)
    slots.earnedThisLife[index] =
      kept >= 0 ? (previous.earnedThisLife[kept] as boolean) : pointsThisLife > 0
  }
  ledger.slotsById.set(playerId, slots)
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
  forgetKiller(ledger, playerId)
}

/** Quem saiu não é alvo de ECO de ninguém, nem tem mais o próprio. */
function forgetKiller(ledger: ScorestreakLedger, playerId: string): void {
  ledger.lastKillerOf.delete(playerId)
  for (const [victimId, killerId] of ledger.lastKillerOf) {
    if (killerId === playerId) ledger.lastKillerOf.delete(victimId)
  }
  removeRecentKiller(ledger.recentKillers, playerId)
}

function removeRecentKiller(recentKillers: string[], playerId: string): void {
  const index = recentKillers.indexOf(playerId)
  if (index >= 0) recentKillers.splice(index, 1)
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
  recordKiller(ledger, kill)
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

/** A kill de outro: o atirador vira o alvo do ECO da vítima, e o mais recente de todos. */
function recordKiller(ledger: ScorestreakLedger, kill: Readonly<KillEvent>): void {
  ledger.lastKillerOf.set(kill.victimId, kill.shooterId)
  removeRecentKiller(ledger.recentKillers, kill.shooterId)
  ledger.recentKillers.push(kill.shooterId)
}

/**
 * Quem o ECO de `ownerId` marca: quem o matou por último. Quem ainda não
 * morreu nesta partida — o ECO sai de uma sequência de kills, e isso é comum —
 * marca o inimigo que matou alguém mais recentemente, a ameaça do momento.
 * Sem kill de ninguém além do dono, `undefined`: não há quem marcar.
 *
 * ```ts
 * echoSubjectOf(ledger, 'local') // 'bot-1'
 * ```
 */
export function echoSubjectOf(
  ledger: Readonly<ScorestreakLedger>,
  ownerId: string,
): string | undefined {
  const killerId = ledger.lastKillerOf.get(ownerId)
  if (killerId !== undefined) return killerId
  const { recentKillers } = ledger
  // de trás para a frente: o fim da lista é a kill mais nova (o `lib` é ES2022, sem `findLast`).
  for (let index = recentKillers.length - 1; index >= 0; index -= 1) {
    const shooterId = recentKillers[index] as string
    if (shooterId !== ownerId) return shooterId
  }
  return undefined
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
  if (spent) into.push(activationNotice(ledger, playerId, slot, spent))
  return spent
}

/** O aviso do acionamento; o do ECO leva quem ele marca, se há alguém. */
function activationNotice(
  ledger: Readonly<ScorestreakLedger>,
  playerId: string,
  slot: number,
  scorestreak: ScorestreakSlug,
): ScorestreakNotice {
  const notice: ScorestreakNotice = { kind: 'activated', playerId, slot, scorestreak }
  if (scorestreak !== 'echo') return notice
  const subjectId = echoSubjectOf(ledger, playerId)
  return subjectId === undefined ? notice : { ...notice, subjectId }
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
  return true
}

/**
 * A partida nova: ninguém tem nada ganho nem guardado, nem quem matou quem,
 * e cada um mantém a escolha.
 *
 * ```ts
 * resetScorestreakLedger(parts.scorestreaks)
 * ```
 */
export function resetScorestreakLedger(ledger: ScorestreakLedger): void {
  for (const slots of ledger.slotsById.values()) resetScorestreakSlots(slots)
  ledger.lastKillerOf.clear()
  ledger.recentKillers.length = 0
}
