import {
  activateScorestreak,
  type BotSquad,
  createScorestreakLedger,
  DEFAULT_SCORESTREAK_LOADOUT,
  enlistScorestreaks,
  pickBotScorestreaks,
  resetScorestreakLedger,
  type ScorestreakLedger,
  type ScorestreakSlots,
  type ScorestreakSlug,
} from '@shobu/core'
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
