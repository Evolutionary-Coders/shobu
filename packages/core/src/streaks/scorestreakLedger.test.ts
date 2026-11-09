import { describe, expect, it } from 'vitest'
import { config } from '../bots/botTestKit.ts'
import { createKillEvent, type KillEvent } from '../scoring/killEvent.ts'
import { addPlayer, createScoreboard, type Scoreboard } from '../scoring/scoreboard.ts'
import {
  activateScorestreak,
  confirmScorestreakEarned,
  createScorestreakLedger,
  creditScorestreakKill,
  dropScorestreaks,
  echoSubjectOf,
  enlistScorestreaks,
  forgetScorestreakDeath,
  rechooseScorestreaks,
  resetScorestreakLedger,
  type ScorestreakNotice,
} from './scorestreakLedger.ts'
import { DEFAULT_SCORESTREAK_LOADOUT } from './scorestreakSlots.ts'

const costs = config.scorestreaks

function killOf(shooterId: string, victimId: string): KillEvent {
  return { ...createKillEvent(), shooterId, victimId }
}

/** O placar com o atirador já nos pontos dados, como `recordKill` o deixaria. */
function boardWith(playerId: string, points: number): Scoreboard {
  const board = createScoreboard()
  addPlayer(board, playerId).scorestreakPoints = points
  return board
}

describe('creditScorestreakKill', () => {
  it('a kill que leva aos 400 deixa o PING pronto e avisa só o ganho', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    const notices: ScorestreakNotice[] = []
    creditScorestreakKill(ledger, boardWith('a', costs.pingCost), killOf('a', 'b'), costs, notices)
    expect(notices).toEqual([{ kind: 'earned', playerId: 'a', slot: 0, scorestreak: 'ping' }])
    expect(ledger.slotsById.get('a')?.ready).toEqual([true, false, false])
  })

  it('o bot aciona a série no mesmo tick em que a ganha', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'bot-0', DEFAULT_SCORESTREAK_LOADOUT, true)
    const notices: ScorestreakNotice[] = []
    const board = boardWith('bot-0', costs.pingCost)
    creditScorestreakKill(ledger, board, killOf('bot-0', 'b'), costs, notices)
    expect(notices.map((notice) => notice.kind)).toEqual(['earned', 'activated'])
    expect(ledger.slotsById.get('bot-0')?.ready).toEqual([false, false, false])
  })

  it('a vítima volta a poder ganhar, e a série guardada atravessa a morte', () => {
    const ledger = createScorestreakLedger()
    const victim = enlistScorestreaks(ledger, 'v', DEFAULT_SCORESTREAK_LOADOUT)
    victim.earnedThisLife[0] = true
    victim.ready[0] = true
    creditScorestreakKill(ledger, createScoreboard(), killOf('x', 'v'), costs, [])
    expect(victim.earnedThisLife).toEqual([false, false, false])
    expect(victim.ready).toEqual([true, false, false])
  })

  it('matar a si mesmo não dá série', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    const notices: ScorestreakNotice[] = []
    creditScorestreakKill(ledger, boardWith('a', 5000), killOf('a', 'a'), costs, notices)
    expect(notices).toEqual([])
  })

  it('ignora atirador fora do livro ou fora do placar', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    const notices: ScorestreakNotice[] = []
    creditScorestreakKill(ledger, boardWith('z', 5000), killOf('z', 'b'), costs, notices)
    creditScorestreakKill(ledger, createScoreboard(), killOf('a', 'b'), costs, notices)
    expect(notices).toEqual([])
  })
})

describe('activateScorestreak', () => {
  it('gasta a série pronta e avisa', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    confirmScorestreakEarned(ledger, 'a', 0, 'ping')
    const notices: ScorestreakNotice[] = []
    expect(activateScorestreak(ledger, 'a', 0, notices)).toBe('ping')
    expect(notices).toEqual([{ kind: 'activated', playerId: 'a', slot: 0, scorestreak: 'ping' }])
  })

  it.each([
    ['não pronta', 'a', 1],
    ['slot fora da faixa', 'a', 7],
    ['id fora do livro', 'z', 0],
  ])('%s não gasta nem avisa', (_, playerId, slot) => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    const notices: ScorestreakNotice[] = []
    expect(activateScorestreak(ledger, playerId, slot, notices)).toBeUndefined()
    expect(notices).toEqual([])
  })
})

describe('o alvo do ECO', () => {
  /** As kills, em ordem, pelo livro: cada par é atirador e vítima. */
  function ledgerAfter(kills: readonly (readonly [string, string])[]) {
    const ledger = createScorestreakLedger()
    for (const [shooterId, victimId] of kills) {
      creditScorestreakKill(ledger, createScoreboard(), killOf(shooterId, victimId), costs, [])
    }
    return ledger
  }

  it('é quem matou o dono por último', () => {
    const ledger = ledgerAfter([
      ['b', 'a'],
      ['c', 'a'],
      ['b', 'c'],
    ])
    expect(echoSubjectOf(ledger, 'a')).toBe('c')
  })

  it('quem ainda não morreu marca o inimigo que matou mais recentemente', () => {
    const ledger = ledgerAfter([
      ['b', 'c'],
      ['c', 'b'],
      ['a', 'b'],
    ])
    expect(echoSubjectOf(ledger, 'a')).toBe('c')
  })

  it('matar a si mesmo não marca ninguém, e sem kill de outro não há alvo', () => {
    const ledger = ledgerAfter([
      ['a', 'a'],
      ['a', 'b'],
    ])
    expect(echoSubjectOf(ledger, 'a')).toBeUndefined()
  })

  it('quem sai não é alvo de ninguém, nem guarda o próprio', () => {
    const ledger = ledgerAfter([
      ['b', 'a'],
      ['a', 'c'],
      ['c', 'b'],
    ])
    dropScorestreaks(ledger, 'b')
    expect(echoSubjectOf(ledger, 'a')).toBe('c')
    expect(ledger.lastKillerOf.has('b')).toBe(false)
    dropScorestreaks(ledger, 'c')
    expect(echoSubjectOf(ledger, 'a')).toBeUndefined()
    expect(echoSubjectOf(ledger, 'z')).toBe('a')
  })

  it('a partida nova esquece quem matou quem', () => {
    const ledger = ledgerAfter([['b', 'a']])
    resetScorestreakLedger(ledger)
    expect(echoSubjectOf(ledger, 'a')).toBeUndefined()
  })

  it('o aviso do ECO acionado leva o alvo; sem alvo, vem sem o campo', () => {
    const ledger = ledgerAfter([['b', 'a']])
    enlistScorestreaks(ledger, 'a', ['ping', 'sonar', 'echo'])
    enlistScorestreaks(ledger, 'b', ['ping', 'sonar', 'echo'])
    confirmScorestreakEarned(ledger, 'a', 2, 'echo')
    confirmScorestreakEarned(ledger, 'b', 2, 'echo')
    const notices: ScorestreakNotice[] = []
    activateScorestreak(ledger, 'a', 2, notices)
    activateScorestreak(ledger, 'b', 2, notices)
    expect(notices).toEqual([
      { kind: 'activated', playerId: 'a', slot: 2, scorestreak: 'echo', subjectId: 'b' },
      { kind: 'activated', playerId: 'b', slot: 2, scorestreak: 'echo' },
    ])
  })
})

describe('confirmScorestreakEarned', () => {
  it('marca a série ganha nesta vida e pronta', () => {
    const ledger = createScorestreakLedger()
    const slots = enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    expect(confirmScorestreakEarned(ledger, 'a', 2, 'emp')).toBe(true)
    expect(slots.ready).toEqual([false, false, true])
    expect(slots.earnedThisLife).toEqual([false, false, true])
  })

  it('ignora o aviso cujo slot já é de outra série: a escolha mudou com ele em trânsito', () => {
    const ledger = createScorestreakLedger()
    const slots = enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    expect(confirmScorestreakEarned(ledger, 'a', 0, 'sonar')).toBe(false)
    expect(slots.ready).toEqual([false, false, false])
  })

  it('ignora slot fora da faixa e id fora do livro', () => {
    const ledger = createScorestreakLedger()
    const slots = enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    confirmScorestreakEarned(ledger, 'a', 3, 'ping')
    confirmScorestreakEarned(ledger, 'z', 0, 'ping')
    expect(slots.ready).toEqual([false, false, false])
  })
})

describe('inscrição e partida nova', () => {
  it('reinscrever troca as séries e deixa de acionar sozinho', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT, true)
    const slots = enlistScorestreaks(ledger, 'a', ['echo', 'sonar', 'emp'])
    expect(ledger.slotsById.get('a')).toBe(slots)
    expect(ledger.autoSpenders.has('a')).toBe(false)
  })

  it('quem sai deixa o livro', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT, true)
    dropScorestreaks(ledger, 'a')
    expect(ledger.slotsById.has('a')).toBe(false)
    expect(ledger.autoSpenders.has('a')).toBe(false)
  })

  it('a morte pela borda só esquece a vida, e id fora do livro é ignorado', () => {
    const ledger = createScorestreakLedger()
    const slots = enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    confirmScorestreakEarned(ledger, 'a', 0, 'ping')
    forgetScorestreakDeath(ledger, 'a')
    forgetScorestreakDeath(ledger, 'z')
    expect(slots.earnedThisLife).toEqual([false, false, false])
    expect(slots.ready).toEqual([true, false, false])
  })

  it('a partida nova zera o ganho e o guardado de todos', () => {
    const ledger = createScorestreakLedger()
    const slots = enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    confirmScorestreakEarned(ledger, 'a', 1, 'rapid-bolt')
    resetScorestreakLedger(ledger)
    expect(slots.ready).toEqual([false, false, false])
    expect(slots.earnedThisLife).toEqual([false, false, false])
  })
})

describe('rechooseScorestreaks', () => {
  it('a série que continua leva o estado, mesmo trocando de slot', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    confirmScorestreakEarned(ledger, 'a', 0, 'ping')
    const slots = rechooseScorestreaks(
      ledger,
      'a',
      ['sonar', 'ping', 'counter-ping'],
      costs.pingCost,
    )
    expect(slots?.ready).toEqual([false, true, false])
    expect(slots?.earnedThisLife).toEqual([true, true, true])
    expect(ledger.slotsById.get('a')).toBe(slots)
  })

  it('numa vida sem pontos, a série nova pode sair já nesta vida', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    const slots = rechooseScorestreaks(ledger, 'a', ['ping', 'sonar', 'emp'], 0)
    expect(slots?.earnedThisLife).toEqual([false, false, false])
  })

  it('a série que continua e ainda não saiu pode sair nesta vida (regressão da revisão)', () => {
    // antes, qualquer troca com pontos travava as três séries até a morte.
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    rechooseScorestreaks(ledger, 'a', ['ping', 'rapid-bolt', 'emp'], 100)
    const notices: ScorestreakNotice[] = []
    creditScorestreakKill(ledger, boardWith('a', costs.pingCost), killOf('a', 'b'), costs, notices)
    expect(notices.map((notice) => notice.scorestreak)).toEqual(['ping'])
  })

  it('a mesma escolha devolve os mesmos slots, e id fora do livro devolve undefined', () => {
    const ledger = createScorestreakLedger()
    const slots = enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    expect(rechooseScorestreaks(ledger, 'a', [...DEFAULT_SCORESTREAK_LOADOUT], 500)).toBe(slots)
    expect(rechooseScorestreaks(ledger, 'z', ['ping', 'sonar', 'emp'], 0)).toBeUndefined()
  })

  it('mantém quem aciona sozinho', () => {
    const ledger = createScorestreakLedger()
    enlistScorestreaks(ledger, 'bot-0', DEFAULT_SCORESTREAK_LOADOUT, true)
    rechooseScorestreaks(ledger, 'bot-0', ['ping', 'sonar', 'emp'], 0)
    expect(ledger.autoSpenders.has('bot-0')).toBe(true)
  })
})
