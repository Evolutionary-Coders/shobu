import {
  activateScorestreak,
  type BotSquad,
  confirmScorestreakEarned,
  createScorestreakLedger,
  DEFAULT_SCORESTREAK_LOADOUT,
  dropScorestreaks,
  enlistScorestreaks,
  pickBotScorestreaks,
  resetScorestreakLedger,
  type ScorestreakActivatedMessage,
  type ScorestreakEarnedMessage,
  type ScorestreakLedger,
  type ScorestreakSlots,
  type ScorestreakSlug,
  spendScorestreak,
} from '@shobu/core'
import { fighterIndexOf, type PuppetSeats, type RoomFeed } from './arenaOnline.ts'
import { type ArenaParts, LOCAL_PLAYER_ID } from './arenaParts.ts'
import type { MatchRules } from './arenaSession.ts'
import { createScorestreakTrigger, takeScorestreakSlot } from './scorestreakTrigger.ts'

/**
 * As séries de pontuação da arena do lado do cliente (ADR 0029), com o mesmo
 * livro do núcleo que a sala do servidor usa. Offline, o cliente decide: a
 * kill credita (`creditScorestreakKill` em `scoreKill`) e o aperto aciona.
 * Online, quem decide é a sala, e o cliente só segue o que ela diz.
 */

/**
 * As peças de série da arena no boot: o aperto ainda vazio, nenhum aviso, e o
 * livro com o jogador nas séries padrão, até a partida dizer outras, e cada
 * bot com as três que a vaga sorteia — as mesmas que o servidor sorteia para
 * ela, com a mesma semente. Bot aciona a série assim que a ganha.
 *
 * ```ts
 * const parts = { ...createArenaScorestreakParts(squad, seedBase) }
 * ```
 */
export function createArenaScorestreakParts(
  squad: BotSquad,
  seedBase: number,
): Pick<ArenaParts, 'scorestreakTrigger' | 'scorestreaks' | 'scorestreakNotices'> {
  const scorestreaks = createScorestreakLedger()
  enlistScorestreaks(scorestreaks, LOCAL_PLAYER_ID, DEFAULT_SCORESTREAK_LOADOUT)
  enlistArenaBots(scorestreaks, squad, seedBase)
  return { scorestreakTrigger: createScorestreakTrigger(), scorestreaks, scorestreakNotices: [] }
}

/**
 * Os bots locais no livro, cada um com o sorteio da vaga dele. Na volta da
 * sala caída, eles entram de novo do zero.
 *
 * ```ts
 * enlistArenaBots(parts.scorestreaks, parts.squad, parts.seedBase)
 * ```
 */
export function enlistArenaBots(
  ledger: ScorestreakLedger,
  squad: BotSquad,
  seedBase: number,
): void {
  for (const [index, bot] of squad.bots.entries()) {
    enlistScorestreaks(ledger, bot.id, pickBotScorestreaks(seedBase, index), true)
  }
}

/**
 * A sala conectou: os fantoches não são nossos, e as séries deles também não.
 *
 * ```ts
 * dropArenaBots(parts.scorestreaks, parts.squad)
 * ```
 */
export function dropArenaBots(ledger: ScorestreakLedger, squad: BotSquad): void {
  for (const bot of squad.bots) dropScorestreaks(ledger, bot.id)
}

/**
 * O aperto de série do tick, offline: aciona a série do slot, se está pronta.
 * O aperto é lido **sempre**, vivo ou morto: o que foi apertado com o jogador
 * morto não pode acionar sozinho no respawn. Online o aperto vai para a sala
 * (`arenaOnline.ts`), e aqui ele fica intocado.
 *
 * ```ts
 * spendLocalScorestreakPress(parts) // no começo de cada tick
 * ```
 */
export function spendLocalScorestreakPress(parts: ArenaParts): void {
  if (parts.online) return
  const slot = takeScorestreakSlot(parts.scorestreakTrigger)
  if (slot < 0 || !parts.local.alive) return
  activateScorestreak(parts.scorestreaks, LOCAL_PLAYER_ID, slot, parts.scorestreakNotices)
}

/**
 * A partida nova. Offline, ninguém tem nada ganho nem guardado. Online, o que
 * está pronto continua: as séries do assento são da sala, que não recomeça com
 * o menu. Em ambos, a escolha do menu vale a partir daqui; trocar a escolha
 * troca os slots, como a sala faz quando recebe a escolha nova.
 *
 * ```ts
 * restartArenaScorestreaks(parts, rules)
 * ```
 */
export function restartArenaScorestreaks(parts: ArenaParts, rules: MatchRules): void {
  if (!parts.online) resetScorestreakLedger(parts.scorestreaks)
  const chosen = rules.scorestreaks
  const current = localScorestreakLoadout(parts.scorestreaks)
  if (!chosen || sameScorestreakLoadout(current, chosen)) return
  enlistScorestreaks(parts.scorestreaks, LOCAL_PLAYER_ID, chosen)
}

/**
 * As séries que o jogador local levou. Ele está no livro desde o boot
 * (`enlistArenaScorestreaks`) e nunca sai.
 *
 * ```ts
 * localScorestreakLoadout(parts.scorestreaks) // ['ping', 'rapid-bolt', 'orbital-strike']
 * ```
 */
export function localScorestreakLoadout(ledger: ScorestreakLedger): readonly ScorestreakSlug[] {
  return (ledger.slotsById.get(LOCAL_PLAYER_ID) as ScorestreakSlots).loadout
}

function sameScorestreakLoadout(
  a: readonly ScorestreakSlug[],
  b: readonly ScorestreakSlug[],
): boolean {
  return a.length === b.length && a.every((slug, index) => slug === b[index])
}

/**
 * Online, antes do tick: a escolha vai à sala quando muda, e o aperto vira
 * pedido. Quem decide se a série sai é a sala; o aperto com o jogador morto
 * some, para não acionar sozinho no respawn.
 *
 * ```ts
 * followRoomScorestreaks(parts, seats, feed) // em followRoom, a cada quadro
 * ```
 */
export function followRoomScorestreaks(
  parts: ArenaParts,
  seats: PuppetSeats,
  feed: RoomFeed,
): void {
  const loadout = localScorestreakLoadout(parts.scorestreaks)
  if (loadout !== seats.sentScorestreaks) {
    seats.sentScorestreaks = loadout
    feed.chooseScorestreaks(loadout)
  }
  const slot = takeScorestreakSlot(parts.scorestreakTrigger)
  if (slot >= 0 && parts.local.alive) feed.requestScorestreak(slot)
}

/**
 * O que a sala decidiu das séries desde o quadro anterior: o que este jogador
 * ganhou, e o que cada um acionou. Viram os mesmos avisos do jogo offline.
 *
 * ```ts
 * drainRoomScorestreaks(parts, seats, feed) // em followRemotes
 * ```
 */
export function drainRoomScorestreaks(parts: ArenaParts, seats: PuppetSeats, feed: RoomFeed): void {
  feed.drainScorestreakEarned((earned) => ingestScorestreakEarned(parts, earned))
  feed.drainScorestreakActivated((activated) =>
    ingestScorestreakActivated(parts, seats, feed.ownId, activated),
  )
}

/** A série que a sala diz que este jogador ganhou fica pronta aqui também. */
function ingestScorestreakEarned(parts: ArenaParts, earned: ScorestreakEarnedMessage): void {
  confirmScorestreakEarned(parts.scorestreaks, LOCAL_PLAYER_ID, earned.slot)
  parts.scorestreakNotices.push({
    kind: 'earned',
    playerId: LOCAL_PLAYER_ID,
    slot: earned.slot,
    scorestreak: earned.scorestreak,
  })
}

/**
 * Uma série acionada na sala, com o id da sala trocado pelo da sessão: a do
 * próprio jogador sai do livro local, e a de qualquer um vira aviso. Quem a
 * sessão ainda não viu não tem nome para a tela.
 */
function ingestScorestreakActivated(
  parts: ArenaParts,
  seats: PuppetSeats,
  ownId: string | undefined,
  activated: ScorestreakActivatedMessage,
): void {
  const fighter = parts.fighters[fighterIndexOf(seats, ownId, activated.playerId)]
  if (!fighter) return
  const { slot, scorestreak } = activated
  // online só o jogador local está no livro: os fantoches são da sala.
  const slots = parts.scorestreaks.slotsById.get(fighter.id)
  if (slots) spendScorestreak(slots, slot)
  parts.scorestreakNotices.push({ kind: 'activated', playerId: fighter.id, slot, scorestreak })
}
