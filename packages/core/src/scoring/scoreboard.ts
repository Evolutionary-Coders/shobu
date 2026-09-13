import type { KillEvent } from './killEvent.ts'

export interface PlayerScore {
  readonly playerId: string
  points: number
  kills: number
  deaths: number
  /** Kills sem morrer; zera na morte. É a base da `sequência` e da `derrubada`. */
  streak: number
  /** Instante da última kill. `-Infinity` antes da primeira — é a janela de multikill. */
  lastKillAtS: number
  /** Quem matou por último, ou `undefined`. É a `vingança`. */
  lastKilledById: string | undefined
}

/**
 * O placar da partida. Ordem de inserção é ordem de entrada, e é o desempate
 * do GDD: empate fica empate, e quem entrou antes aparece antes.
 */
export interface Scoreboard {
  readonly players: Map<string, PlayerScore>
  /** Total da partida — é o que decide o `primeiro-sangue`. */
  kills: number
}

export function createScoreboard(): Scoreboard {
  return { players: new Map(), kills: 0 }
}

export function addPlayer(board: Scoreboard, playerId: string): PlayerScore {
  const existing = board.players.get(playerId)
  if (existing) return existing
  const score: PlayerScore = {
    playerId,
    points: 0,
    kills: 0,
    deaths: 0,
    streak: 0,
    lastKillAtS: Number.NEGATIVE_INFINITY,
    lastKilledById: undefined,
  }
  board.players.set(playerId, score)
  return score
}

export function removePlayer(board: Scoreboard, playerId: string): void {
  board.players.delete(playerId)
}

/**
 * Aplica a kill e devolve os pontos creditados ao atirador. É o **único** lugar
 * que muda o placar.
 *
 * Devolve número, e não `void`, para a camada de medalhas somar por cima sem
 * mexer nesta assinatura: `applyKill(...) + awardMedals(board, event, config)`.
 *
 * ```ts
 * applyKill(board, event, config.match.pointsPerKill) // 1
 * ```
 */
export function applyKill(
  board: Scoreboard,
  event: Readonly<KillEvent>,
  pointsPerKill: number,
): number {
  const victim = addPlayer(board, event.victimId)
  victim.deaths += 1
  victim.streak = 0
  victim.lastKilledById = event.shooterId
  board.kills += 1
  // matar a si mesmo não pontua. Hoje é inalcançável; no dia do servidor, não.
  if (event.shooterId === event.victimId) return 0
  const shooter = addPlayer(board, event.shooterId)
  shooter.points += pointsPerKill
  shooter.kills += 1
  shooter.streak += 1
  shooter.lastKillAtS = event.atS
  return pointsPerKill
}

/**
 * O placar ordenado, escrito num vetor reaproveitado — é o que o tab desenha.
 * Empate mantém a ordem de entrada, que é a regra de desempate do GDD.
 */
export function rankedScores(board: Scoreboard, into: PlayerScore[]): readonly PlayerScore[] {
  into.length = 0
  for (const score of board.players.values()) into.push(score)
  into.sort((a, b) => b.points - a.points)
  return into
}
