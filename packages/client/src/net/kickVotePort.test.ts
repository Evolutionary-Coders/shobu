import { KICK_BALLOT_PENDING } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeGameLink } from './gameLinkFake.ts'
import type { KickVoteNotice } from './kickVotePort.ts'
import { createNetworkPort } from './networkPort.ts'
import type { RoomMatchFields } from './roomMatchView.ts'

const MATCH: RoomMatchFields = {
  phase: 1,
  phaseLeftDs: 1000,
  arenaId: 'neon-kaido',
  ballots: new Map(),
  winner: -1,
  nextArenaId: '',
}

function notices(port: ReturnType<typeof createNetworkPort>): KickVoteNotice[] {
  const seen: KickVoteNotice[] = []
  port.drainKickVoteNotices((notice) => seen.push(notice))
  return seen
}

describe('o voto de expulsão pela porta', () => {
  it('sem sala, não há voto, nem anfitrião, e o pedido se perde', () => {
    const port = createNetworkPort()
    port.startKickVote('bia')
    port.castKickBallot(true)
    expect(port.kickVote()).toBeUndefined()
    expect(port.hostId()).toBeUndefined()
  })

  it('manda o pedido e o voto à sala', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    port.startKickVote('bia')
    port.castKickBallot(false)
    expect(link.kickVotesStarted).toEqual(['bia'])
    expect(link.kickBallots).toEqual([false])
  })

  it('lê o voto aberto e o anfitrião do estado da sala', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    expect(port.hostId()).toBeUndefined()
    link.match = {
      ...MATCH,
      hostId: 'eu',
      kickVote: {
        targetId: 'bia',
        targetName: 'BIA',
        initiatorId: 'ana',
        leftDs: 100,
        yes: 1,
        no: 0,
        needed: 2,
        ballots: new Map([['eu', KICK_BALLOT_PENDING]]),
      },
    }
    expect(port.hostId()).toBe('eu')
    expect(port.kickVote()).toMatchObject({ targetId: 'bia', isEligible: true, leftS: 10 })
    link.match = { ...MATCH, hostId: '' }
    expect(port.hostId()).toBeUndefined()
  })

  it('guarda a recusa e o fim até o quadro seguinte, uma vez cada', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.refuseKick('cooldown')
    link.closeKickVote({ targetId: 'bia', targetName: 'BIA', outcome: 'passed' })
    expect(notices(port)).toEqual([
      { kind: 'refused', reason: 'cooldown' },
      { kind: 'closed', closed: { targetId: 'bia', targetName: 'BIA', outcome: 'passed' } },
    ])
    expect(notices(port)).toEqual([])
  })

  it('a sala que chegou por desvio do banimento avisa uma vez, na chegada', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    link.refusedAddress = '198.51.100.9'
    port.attach(link)
    expect(notices(port)).toEqual([{ kind: 'rerouted', address: '198.51.100.9' }])
    expect(notices(port)).toEqual([])
  })

  it('o aviso da sala que já foi trocada não entra', () => {
    const port = createNetworkPort()
    const old = new FakeGameLink()
    port.attach(old)
    port.attach(new FakeGameLink())
    old.refuseKick('cooldown')
    expect(notices(port)).toEqual([])
  })
})
