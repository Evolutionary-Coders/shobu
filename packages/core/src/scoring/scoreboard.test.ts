import { describe, expect, it } from 'vitest'
import { createKillEvent, type KillEvent, type MutableKillEvent } from './killEvent.ts'
import {
  addPlayer,
  applyBoundaryDeath,
  applyKill,
  createScoreboard,
  killsWithin,
  MULTIKILL_MEMORY,
  type PlayerScore,
  rankedScores,
  removePlayer,
  resetScoreboard,
} from './scoreboard.ts'

const POINTS_PER_KILL = 1

function killOf(shooterId: string, victimId: string, over: Partial<KillEvent> = {}): KillEvent {
  return Object.assign(createKillEvent() as MutableKillEvent, { shooterId, victimId }, over)
}

describe('applyKill', () => {
  it('uma kill vale os pontos por kill da configuração', () => {
    const board = createScoreboard()
    expect(applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)).toBe(POINTS_PER_KILL)
    expect(board.players.get('a')?.points).toBe(POINTS_PER_KILL)
  })

  it('a kill conta para o atirador e a morte para a vítima', () => {
    const board = createScoreboard()
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    expect(board.players.get('a')?.kills).toBe(1)
    expect(board.players.get('b')?.deaths).toBe(1)
    expect(board.players.get('a')?.deaths).toBe(0)
  })

  it('a sequência cresce a cada kill e zera na morte', () => {
    const board = createScoreboard()
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    expect(board.players.get('a')?.streak).toBe(2)
    applyKill(board, killOf('b', 'a'), POINTS_PER_KILL)
    expect(board.players.get('a')?.streak).toBe(0)
  })

  it('guarda a maior sequência, que sobrevive à morte que zera a de agora', () => {
    const board = createScoreboard()
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    applyKill(board, killOf('b', 'a'), POINTS_PER_KILL)
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    expect(board.players.get('a')?.streak).toBe(1)
    expect(board.players.get('a')?.bestStreak).toBe(2)
  })

  it('guarda quando os pontos subiram pela última vez, o último desempate do MVP', () => {
    const board = createScoreboard()
    applyKill(board, killOf('a', 'b', { atS: 12 }), POINTS_PER_KILL)
    applyKill(board, killOf('b', 'a', { atS: 30 }), POINTS_PER_KILL)
    expect(board.players.get('a')?.scoredAtS).toBe(12)
    expect(board.players.get('b')?.scoredAtS).toBe(30)
  })

  it('guarda quem matou por último, que é a base da vingança', () => {
    const board = createScoreboard()
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    expect(board.players.get('b')?.lastKilledById).toBe('a')
  })

  it('guarda o instante da última kill, que é a base da kill múltipla', () => {
    const board = createScoreboard()
    applyKill(board, killOf('a', 'b', { atS: 42.5 }), POINTS_PER_KILL)
    expect(board.players.get('a')?.lastKillAtS).toBe(42.5)
  })

  /** Hoje inalcançável; no dia do servidor, obrigatório. */
  it('matar a si mesmo não pontua, mas conta a morte', () => {
    const board = createScoreboard()
    expect(applyKill(board, killOf('a', 'a'), POINTS_PER_KILL)).toBe(0)
    expect(board.players.get('a')?.points).toBe(0)
    expect(board.players.get('a')?.deaths).toBe(1)
  })

  it('o total da partida conta toda kill, e é o que diz qual foi a primeira', () => {
    const board = createScoreboard()
    expect(board.kills).toBe(0)
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    expect(board.kills).toBe(1)
  })
})

describe('rankedScores', () => {
  it('sai ordenado por pontos', () => {
    const board = createScoreboard()
    addPlayer(board, 'a')
    applyKill(board, killOf('b', 'a'), POINTS_PER_KILL)
    applyKill(board, killOf('b', 'a'), POINTS_PER_KILL)
    expect(rankedScores(board, []).map((score) => score.playerId)).toEqual(['b', 'a'])
  })

  /** Empate fica empate (GDD): quem entrou antes aparece antes. */
  it('empate mantém a ordem de entrada', () => {
    const board = createScoreboard()
    addPlayer(board, 'primeiro')
    addPlayer(board, 'segundo')
    expect(rankedScores(board, []).map((score) => score.playerId)).toEqual(['primeiro', 'segundo'])
  })

  it('reaproveita o vetor recebido, sem alocar por quadro', () => {
    const board = createScoreboard()
    addPlayer(board, 'a')
    const into: PlayerScore[] = []
    expect(rankedScores(board, into)).toBe(into)
    expect(rankedScores(board, into)).toHaveLength(1)
  })
})

describe('removePlayer', () => {
  it('tira o placar de quem saiu e não mexe no dos outros', () => {
    const board = createScoreboard()
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    removePlayer(board, 'b')
    expect(board.players.has('b')).toBe(false)
    expect(board.players.get('a')?.points).toBe(POINTS_PER_KILL)
  })
})

describe('killsWithin', () => {
  function boardWithKillsAt(instants: readonly number[]): PlayerScore {
    const board = createScoreboard()
    for (const atS of instants) applyKill(board, killOf('a', 'b', { atS }), POINTS_PER_KILL)
    const shooter = board.players.get('a')
    if (!shooter) throw new Error('o atirador tinha que estar no placar')
    return shooter
  }

  it('não conta kill nenhuma antes da primeira', () => {
    expect(killsWithin(addPlayer(createScoreboard(), 'a'), 0, 15)).toBe(0)
  })

  it('conta as duas kills de um double kill dentro da janela', () => {
    expect(killsWithin(boardWithKillsAt([10, 13]), 13, 5)).toBe(2)
  })

  it('não conta a kill que caiu fora da janela', () => {
    expect(killsWithin(boardWithKillsAt([10, 18]), 18, 5)).toBe(1)
  })

  it('a borda da janela conta: exatamente no limite ainda é multikill', () => {
    expect(killsWithin(boardWithKillsAt([10, 15]), 15, 5)).toBe(2)
  })

  it('conta a escada inteira até a memória do vetor', () => {
    const instants = [1, 2, 3, 4, 5]
    expect(killsWithin(boardWithKillsAt(instants), 5, 15)).toBe(MULTIKILL_MEMORY)
  })

  it('esquece a kill mais velha que a memória, mesmo dentro da janela', () => {
    const shooter = boardWithKillsAt([1, 2, 3, 4, 5, 6])
    expect(killsWithin(shooter, 6, 15)).toBe(MULTIKILL_MEMORY)
  })

  it('a morte não apaga a memória de multikill: a janela é que fecha', () => {
    const board = createScoreboard()
    applyKill(board, killOf('a', 'b', { atS: 10 }), POINTS_PER_KILL)
    applyKill(board, killOf('c', 'a', { atS: 11 }), POINTS_PER_KILL)
    applyKill(board, killOf('a', 'b', { atS: 12 }), POINTS_PER_KILL)
    const shooter = board.players.get('a')
    expect(shooter && killsWithin(shooter, 12, 5)).toBe(2)
  })

  it('recusa janela negativa, dizendo o valor recebido', () => {
    const shooter = addPlayer(createScoreboard(), 'a')
    expect(() => killsWithin(shooter, 0, -1)).toThrow(/windowS -1/)
  })
})

describe('KillEvent', () => {
  /**
   * A proposta de `docs/medals.md` pede uma função pura por medalha sobre o
   * evento de kill. Apagar um destes campos quebra uma promessa documentada,
   * e é melhor quebrar aqui.
   */
  it('carrega o que as medalhas propostas precisam medir', () => {
    expect(Object.keys(createKillEvent()).sort()).toEqual([
      'atS',
      'distanceM',
      'hitHeightRatio',
      'scoped',
      'shooterAirborne',
      'shooterGrappling',
      'shooterId',
      'shooterYawTurnDeg',
      'victimAirborne',
      'victimFacingAwayDeg',
      'victimId',
      'victimsInShot',
      'weapon',
    ])
  })
})

describe('applyBoundaryDeath', () => {
  it('conta a morte e zera a sequência, sem pontuar ninguém (revisão do #16)', () => {
    const board = createScoreboard()
    const player = addPlayer(board, 'local')
    player.streak = 4
    applyBoundaryDeath(board, 'local')
    expect([player.deaths, player.streak, player.points, board.kills]).toEqual([1, 0, 0, 0])
  })

  it('não mexe na vingança: ninguém matou', () => {
    const board = createScoreboard()
    const player = addPlayer(board, 'local')
    player.lastKilledById = 'rival'
    applyBoundaryDeath(board, 'local')
    expect(player.lastKilledById).toBe('rival')
  })
})

/** O tab redesenha só quando o placar muda: cada mudança tem que subir a revisão. */
describe('a revisão do placar', () => {
  it('sobe com quem entra, com kill, com morte no limite e com quem sai', () => {
    const board = createScoreboard()
    const revisions = [board.revision]
    addPlayer(board, 'a')
    revisions.push(board.revision)
    applyKill(board, killOf('a', 'b'), POINTS_PER_KILL)
    revisions.push(board.revision)
    applyBoundaryDeath(board, 'a')
    revisions.push(board.revision)
    removePlayer(board, 'b')
    revisions.push(board.revision)
    for (let index = 1; index < revisions.length; index += 1) {
      expect(revisions[index]).toBeGreaterThan(revisions[index - 1] ?? Number.POSITIVE_INFINITY)
    }
  })

  it('não sobe com o que não muda nada: o jogador que já está, ou quem não estava sair', () => {
    const board = createScoreboard()
    addPlayer(board, 'a')
    const before = board.revision
    addPlayer(board, 'a')
    removePlayer(board, 'z')
    expect(board.revision).toBe(before)
  })
})

describe('resetScoreboard', () => {
  /** Regressão: o placar atravessava partidas, e o tab da segunda abria com as kills da primeira. */
  it('zera todo mundo e a contagem da partida, e mantém a sala na ordem de entrada', () => {
    const board = createScoreboard()
    addPlayer(board, 'a')
    applyKill(board, killOf('b', 'a', { atS: 3 }), POINTS_PER_KILL)
    applyKill(board, killOf('b', 'a', { atS: 4 }), POINTS_PER_KILL)
    addPlayer(board, 'b').medals = 2
    resetScoreboard(board)
    expect([...board.players.keys()]).toEqual(['a', 'b'])
    expect(board.kills).toBe(0)
    const b = board.players.get('b') as PlayerScore
    expect([b.points, b.kills, b.deaths, b.streak, b.bestStreak, b.medals]).toEqual([
      0, 0, 0, 0, 0, 0,
    ])
    expect(b.lastKillAtS).toBe(Number.NEGATIVE_INFINITY)
    expect(killsWithin(b, 4, 100)).toBe(0)
    expect(board.players.get('a')?.lastKilledById).toBeUndefined()
  })

  it('sobe a revisão, para o tab redesenhar o zero', () => {
    const board = createScoreboard()
    addPlayer(board, 'a')
    const before = board.revision
    resetScoreboard(board)
    expect(board.revision).toBeGreaterThan(before)
  })
})
