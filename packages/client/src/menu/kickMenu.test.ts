import { describe, expect, it } from 'vitest'
import type { KickVoteView } from '../net/kickVoteView.ts'
import {
  type KickMenu,
  kickBlockedReason,
  kickMenuRoomOf,
  kickRowParts,
  kickRowRequest,
  kickRowShown,
  NO_KICK_MENU,
  stepKickRow,
  withKickRoom,
} from './kickMenu.ts'

const RAIDEN = { id: 'r1', name: 'RAIDEN' }
const KAGE = { id: 'k1', name: 'KAGE' }
const TWO: KickMenu = { ...NO_KICK_MENU, targets: [RAIDEN, KAGE] }

const VOTE: KickVoteView = {
  targetId: 'r1',
  targetName: 'RAIDEN',
  initiatorId: 'k1',
  leftS: 10,
  yes: 1,
  no: 0,
  needed: 2,
  isTarget: false,
  isEligible: true,
  hasVoted: false,
}

describe('withKickRoom', () => {
  it('devolve o mesmo objeto quando a sala não mudou', () => {
    const room = { targets: [RAIDEN, KAGE], ballotFor: undefined, blocked: undefined }
    expect(withKickRoom(TWO, room)).toBe(TWO)
  })

  it('mantém a escolha no mesmo jogador, e volta ao primeiro quando ele sai', () => {
    const chosen = { ...TWO, targetIndex: 1 }
    const shifted = withKickRoom(chosen, {
      targets: [{ id: 'x', name: 'X' }, RAIDEN, KAGE],
      ballotFor: undefined,
      blocked: undefined,
    })
    expect(shifted.targetIndex).toBe(2)
    const gone = withKickRoom(chosen, {
      targets: [RAIDEN],
      ballotFor: undefined,
      blocked: undefined,
    })
    expect(gone.targetIndex).toBe(0)
  })

  it.each([
    { targets: [RAIDEN], ballotFor: undefined, blocked: undefined },
    { targets: [RAIDEN, { id: 'k1', name: 'OUTRO' }], ballotFor: undefined, blocked: undefined },
    { targets: [RAIDEN, KAGE], ballotFor: 'RAIDEN', blocked: undefined },
    { targets: [RAIDEN, KAGE], ballotFor: undefined, blocked: 'SÓ O ANFITRIÃO' },
  ])('troca quando a sala muda: %j', (room) => {
    expect(withKickRoom(TWO, room)).not.toBe(TWO)
  })
})

describe('a linha EXPULSAR JOGADOR', () => {
  it('some sem outro humano e sem voto', () => {
    expect(kickRowShown(NO_KICK_MENU)).toBe(false)
    expect(kickRowShown(TWO)).toBe(true)
    expect(kickRowShown({ ...NO_KICK_MENU, ballotFor: 'RAIDEN' })).toBe(true)
  })

  it('mostra o jogador escolhido e a nota de por que não dá', () => {
    expect(kickRowParts(TWO)).toEqual({ label: 'EXPULSAR', value: 'RAIDEN', note: undefined })
    expect(kickRowParts({ ...TWO, blocked: 'SÓ O ANFITRIÃO' }).note).toBe('SÓ O ANFITRIÃO')
    expect(kickRowParts(NO_KICK_MENU).value).toBe('')
  })

  it('com o voto aberto, vira o voto', () => {
    const ballot = { ...TWO, ballotFor: 'RAIDEN' }
    expect(kickRowParts(ballot)).toEqual({
      label: 'EXPULSAR RAIDEN?',
      value: 'SIM',
      note: undefined,
    })
    expect(kickRowParts(stepKickRow(ballot, 'left')).value).toBe('NÃO')
  })

  it('a seta troca de jogador dando a volta', () => {
    expect(stepKickRow(TWO, 'right').targetIndex).toBe(1)
    expect(stepKickRow(TWO, 'left').targetIndex).toBe(1)
    expect(stepKickRow({ ...TWO, targetIndex: 1 }, 'right').targetIndex).toBe(0)
    expect(stepKickRow(NO_KICK_MENU, 'right')).toBe(NO_KICK_MENU)
  })

  it('confirmar pede o voto, ou abre contra o escolhido, se der', () => {
    expect(kickRowRequest(TWO)).toEqual({ kind: 'start', targetId: 'r1' })
    expect(kickRowRequest({ ...TWO, blocked: 'SÓ O ANFITRIÃO' })).toBeUndefined()
    expect(kickRowRequest(NO_KICK_MENU)).toBeUndefined()
    expect(kickRowRequest({ ...TWO, ballotFor: 'RAIDEN', ballotYes: false })).toEqual({
      kind: 'ballot',
      yes: false,
    })
  })
})

describe('kickBlockedReason', () => {
  it.each([
    [{ humans: 2, hostId: undefined, ownId: 'eu', minHumans: 3 }, 'PRECISA DE 3 JOGADORES'],
    [{ humans: 3, hostId: undefined, ownId: 'eu', minHumans: 3 }, undefined],
    [{ humans: 2, hostId: 'eu', ownId: 'eu', minHumans: 3 }, undefined],
    [{ humans: 4, hostId: 'outro', ownId: 'eu', minHumans: 3 }, 'SÓ O ANFITRIÃO'],
  ])('%j', (room, reason) => {
    expect(kickBlockedReason(room)).toBe(reason)
  })
})

describe('kickMenuRoomOf', () => {
  const network = (vote: KickVoteView | undefined) => ({
    kickTargets: () => [RAIDEN],
    kickVote: () => vote,
    hostId: () => undefined,
    ownId: 'eu',
  })

  it('lê os alvos e o que barra o pedido', () => {
    expect(kickMenuRoomOf(network(undefined), 3)).toEqual({
      targets: [RAIDEN],
      ballotFor: undefined,
      blocked: 'PRECISA DE 3 JOGADORES',
    })
  })

  it('só oferece o voto a quem ainda vota nele', () => {
    expect(kickMenuRoomOf(network(VOTE), 3).ballotFor).toBe('RAIDEN')
    expect(kickMenuRoomOf(network({ ...VOTE, hasVoted: true }), 3).ballotFor).toBeUndefined()
    expect(kickMenuRoomOf(network({ ...VOTE, isEligible: false }), 3).ballotFor).toBeUndefined()
  })
})
