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
  /**
   * Quem matou por último, ou `undefined`. É a `vingança` — e ela é **cobrada
   * uma vez**: `applyKill` limpa este campo quando o troco é dado, senão dois
   * jogadores trocando kills ganhariam o bônus em todas elas.
   */
  lastKilledById: string | undefined
  /**
   * O valor da escada de multikill já pago na sequência em curso. Cada degrau
   * paga a **diferença** para este número, e não para o degrau imediatamente
   * anterior: as janelas não são encaixadas — 5, 8, 12 e 15 s —, então uma
   * sequência pode pular um degrau, e descontar um degrau que nunca foi pago
   * fazia cinco kills em 15 s somarem 250 em vez de 400.
   */
  multiKillPaid: number
  /**
   * Os instantes das últimas kills, do mais novo para o mais velho, em vetor
   * de tamanho fixo. `lastKillAtS` sozinho não decide multikill: a escada vai
   * até "5 kills em 15 s", e para contar cinco é preciso lembrar de cinco.
   *
   * `-Infinity` é "não houve": ele nunca cai dentro de janela nenhuma. A
   * morte e a partida nova reescrevem tudo com ele (`forgetMultiKills`).
   */
  readonly recentKillsAtS: number[]
}

/**
 * Quantas kills o vetor lembra. É o degrau mais alto da escada de multikill
 * (`kill-chain`, 5 em 15 s) — lembrar de mais seria memória que ninguém lê.
 */
export const MULTIKILL_MEMORY = 5

/**
 * O placar da partida. Ordem de inserção é ordem de entrada, e é o desempate
 * do GDD: empate fica empate, e quem entrou antes aparece antes.
 */
export interface Scoreboard {
  readonly players: Map<string, PlayerScore>
  /** Total da partida — é o que decide o `primeiro-sangue`. */
  kills: number
  /**
   * Sobe a cada mudança do placar. É o que deixa a tela do tab redesenhar
   * **só quando o placar mudou**, comparando um número em vez de varrer os
   * jogadores a cada quadro.
   */
  revision: number
}

export function createScoreboard(): Scoreboard {
  return { players: new Map(), kills: 0, revision: 0 }
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
    multiKillPaid: 0,
    recentKillsAtS: new Array<number>(MULTIKILL_MEMORY).fill(Number.NEGATIVE_INFINITY),
  }
  board.players.set(playerId, score)
  board.revision += 1
  return score
}

export function removePlayer(board: Scoreboard, playerId: string): void {
  if (board.players.delete(playerId)) board.revision += 1
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
  forgetMultiKills(victim)
  victim.lastKilledById = event.shooterId
  board.kills += 1
  board.revision += 1
  // matar a si mesmo não pontua. Hoje é inalcançável; no dia do servidor, não.
  if (event.shooterId === event.victimId) return 0
  const shooter = addPlayer(board, event.shooterId)
  shooter.points += pointsPerKill
  shooter.kills += 1
  shooter.streak += 1
  shooter.lastKillAtS = event.atS
  // o troco foi dado: a `vingança` é uma por morte, não uma por kill.
  if (shooter.lastKilledById === event.victimId) shooter.lastKilledById = undefined
  rememberKill(shooter, event.atS)
  return pointsPerKill
}

/**
 * A morte sem atirador: o prazo fora da área venceu. Conta como morte e
 * **zera a sequência** — sem isto, fugir pela borda com quatro kills
 * guardava a sequência para a quinta, e a medalha vinha sem ter sido merecida
 * (revisão do PR #16). Não pontua ninguém, e não mexe na vingança: ninguém
 * matou.
 *
 * ```ts
 * applyBoundaryDeath(board, 'local')
 * ```
 */
export function applyBoundaryDeath(board: Scoreboard, playerId: string): void {
  const victim = addPlayer(board, playerId)
  victim.deaths += 1
  victim.streak = 0
  forgetMultiKills(victim)
  board.revision += 1
}

/**
 * A morte zera a escada de multikill (decisão de 12/10: "sim, a morte zera").
 * Antes a janela é que fechava, e duas kills de uma vida mais três da seguinte,
 * dentro de 15 s com o respawn de 1,5 s, davam `kill-chain` a quem morreu no
 * meio. Vale para todo combatente, bot incluído: é o mesmo placar.
 */
function forgetMultiKills(score: PlayerScore): void {
  score.lastKillAtS = Number.NEGATIVE_INFINITY
  score.multiKillPaid = 0
  score.recentKillsAtS.fill(Number.NEGATIVE_INFINITY)
}

/**
 * A partida recomeçou e o relógio voltou a zero: esquece tudo o que estava
 * escrito **no relógio velho**. Pontos, kills e mortes ficam — o placar não
 * zera entre partidas (`restartMatch`) —, mas os instantes das kills, sim.
 *
 * Sem isto, a primeira kill da partida nova contava as cinco últimas da
 * anterior, todas com `atS` maior que o de agora e portanto "dentro" de
 * qualquer janela, e saía `kill-chain` matando um bot qualquer. A sequência
 * zera pelo mesmo motivo: ela é "kills sem morrer" **nesta** partida, e uma
 * de cinco trazida da anterior dava `buzzkill` a quem matasse o jogador.
 *
 * ```ts
 * restartMatchClock(board) // matchTimeS = 0 logo depois
 * ```
 */
export function restartMatchClock(board: Scoreboard): void {
  for (const score of board.players.values()) {
    score.streak = 0
    forgetMultiKills(score)
  }
  board.revision += 1
}

/**
 * Empurra o instante para o topo do vetor e descarta o mais velho. `copyWithin`
 * é deslocamento no lugar: nada aloca, e o caminho quente é uma kill por tick.
 */
function rememberKill(score: PlayerScore, atS: number): void {
  score.recentKillsAtS.copyWithin(1, 0)
  score.recentKillsAtS[0] = atS
}

/**
 * Quantas das últimas kills do jogador caem na janela que termina em `atS`. É
 * a conta que decide a família inteira de multikill.
 *
 * ```ts
 * killsWithin(shooter, event.atS, config.medals.doubleKillWindowS) >= 2
 * ```
 */
export function killsWithin(score: Readonly<PlayerScore>, atS: number, windowS: number): number {
  if (!(windowS >= 0)) {
    throw new RangeError(`killsWithin recebeu windowS ${windowS}; esperado número >= 0`)
  }
  return score.recentKillsAtS.filter((killAtS) => killAtS >= atS - windowS).length
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
