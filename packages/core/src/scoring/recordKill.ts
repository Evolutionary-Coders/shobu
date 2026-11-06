import type { GameplayConfig } from '../config/gameplayConfig.ts'
import {
  awardMedals,
  creditMedalBonus,
  type MedalAward,
  medalPointsFrom,
} from '../medals/awardMedals.ts'
import type { KillEvent } from './killEvent.ts'
import { addPlayer, applyKill, type Scoreboard } from './scoreboard.ts'

/**
 * Uma kill no placar: as medalhas e então os pontos, nesta ordem. É **o**
 * caminho de toda kill da arena — do jogador, do bot e, amanhã, do jogador da
 * sala —, para nenhuma delas pontuar diferente das outras (ADR 0016).
 *
 * As medalhas vêm antes porque as condições leem a sequência da vítima, a
 * contagem da partida e a janela de multikill, e `applyKill` muda as três.
 *
 * Devolve os pontos do atirador, medalhas incluídas, e acrescenta as medalhas
 * ao fim de `medalsInto` — quem chama o esvazia no começo do quadro.
 *
 * ```ts
 * recordKill(board, kill, config, medals) // 150
 * ```
 */
export function recordKill(
  board: Scoreboard,
  kill: Readonly<KillEvent>,
  config: GameplayConfig,
  medalsInto: MedalAward[],
): number {
  const firstOfKill = medalsInto.length
  awardMedals(board, kill, config.medals, medalsInto)
  return creditMedalsAndKill(board, kill, config, medalsInto, firstOfKill)
}

/**
 * Uma kill cujas medalhas outro já decidiu — a sala, online (ADR 0031). Pontua
 * igual ao `recordKill`, mas não pergunta nada ao placar local: um cliente que
 * entrou no meio ou voltou do menu não viu as kills de antes, e o primeiro
 * sangue, a sequência e o troco dele sairiam errados.
 *
 * ```ts
 * recordAwardedKill(board, kill, config, fromRoom, medals) // 150
 * ```
 */
export function recordAwardedKill(
  board: Scoreboard,
  kill: Readonly<KillEvent>,
  config: GameplayConfig,
  awards: readonly MedalAward[],
  medalsInto: MedalAward[],
): number {
  const firstOfKill = medalsInto.length
  medalsInto.push(...awards)
  creditMedalBonus(board, kill.shooterId, medalsInto, firstOfKill)
  return creditMedalsAndKill(board, kill, config, medalsInto, firstOfKill)
}

/**
 * O rabo comum de toda kill pontuada: as medalhas que entraram em `medalsInto`
 * a partir de `firstOfKill` contam no atirador e somam o bônus, e só então a
 * kill muda o placar.
 */
function creditMedalsAndKill(
  board: Scoreboard,
  kill: Readonly<KillEvent>,
  config: GameplayConfig,
  medalsInto: readonly MedalAward[],
  firstOfKill: number,
): number {
  addPlayer(board, kill.shooterId).medals += medalsInto.length - firstOfKill
  const bonus = medalPointsFrom(medalsInto, firstOfKill)
  return applyKill(board, kill, config.match.pointsPerKill) + bonus
}
