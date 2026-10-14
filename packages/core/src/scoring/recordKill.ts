import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { awardMedals, type MedalAward, medalPointsFrom } from '../medals/awardMedals.ts'
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
  addPlayer(board, kill.shooterId).medals += medalsInto.length - firstOfKill
  const bonus = medalPointsFrom(medalsInto, firstOfKill)
  return applyKill(board, kill, config.match.pointsPerKill) + bonus
}
