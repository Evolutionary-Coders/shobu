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
  enlistScorestreaks,
  forgetScorestreakDeath,
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

describe('confirmScorestreakEarned', () => {
  it('marca a série ganha nesta vida e pronta', () => {
    const ledger = createScorestreakLedger()
    const slots = enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    expect(confirmScorestreakEarned(ledger, 'a', 2, 'orbital-strike')).toBe(true)
    expect(slots.ready).toEqual([false, false, true])
    expect(slots.earnedThisLife).toEqual([false, false, true])
  })

  it('ignora slot fora da faixa e id fora do livro', () => {
  it('ignora o aviso cujo slot já é de outra série: a escolha mudou com ele em trânsito', () => {
    const ledger = createScorestreakLedger()
    const slots = enlistScorestreaks(ledger, 'a', DEFAULT_SCORESTREAK_LOADOUT)
    expect(confirmScorestreakEarned(ledger, 'a', 0, 'sonar')).toBe(false)
    expect(slots.ready).toEqual([false, false, false])
  })

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
