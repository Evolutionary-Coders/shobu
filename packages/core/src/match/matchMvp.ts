import type { PlayerScore, Scoreboard } from '../scoring/scoreboard.ts'

/**
 * O MVP — o melhor jogador da partida — e a ordem final da sala, pela mesma
 * regra. É regra de partida, e mora no núcleo pelo mesmo motivo do placar: o
 * servidor autoritativo vai escolher o mesmo MVP que o cliente sozinho escolhe
 * hoje, sem trocar mensagem (ADR 0022).
 *
 * A ordem, do critério que decide primeiro ao último:
 *
 * 1. mais **pontos** — é o que o GDD diz que ganha a partida;
 * 2. mais **abates** — entre dois com os mesmos pontos, quem matou mais
 *    jogou mais; o outro os fez em medalha;
 * 3. menos **mortes**;
 * 4. quem **chegou antes** aos pontos que tem (`scoredAtS`) — quem empata
 *    no fim empatou correndo atrás;
 * 5. a **ordem de entrada** na sala, a regra de desempate do GDD. Só sobra
 *    para quem empatou em tudo, e isso é a sala inteira em zero.
 */
export function compareForMvp(a: Readonly<PlayerScore>, b: Readonly<PlayerScore>): number {
  if (a.points !== b.points) return b.points - a.points
  if (a.kills !== b.kills) return b.kills - a.kills
  if (a.deaths !== b.deaths) return a.deaths - b.deaths
  return a.scoredAtS - b.scoredAtS
}

/**
 * A sala na ordem final, do MVP ao último. Aloca: é chamada uma vez, quando
 * a partida acaba. O `sort` do js é estável, e é ele que deixa o último
 * desempate na ordem de entrada.
 *
 * ```ts
 * finalStandings(board)[0] // o MVP
 * ```
 */
export function finalStandings(board: Readonly<Scoreboard>): readonly PlayerScore[] {
  return [...board.players.values()].sort(compareForMvp)
}

/**
 * O MVP da partida, ou `undefined` com o placar vazio.
 *
 * ```ts
 * pickMvp(board)?.playerId // 'bot-1'
 * ```
 */
export function pickMvp(board: Readonly<Scoreboard>): PlayerScore | undefined {
  return finalStandings(board)[0]
}
