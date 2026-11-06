import { describe, expect, it } from 'vitest'
import { NO_KICK_MENU } from './kickMenu.ts'
import { sendKickRequest, syncKickMenu } from './kickMenuSync.ts'
import { createMenuState, type MenuState } from './mainMenuModel.ts'

/** A sala pela porta de rede, de mentira: um humano a expulsar e o que foi pedido. */
class FakeKickNetwork {
  readonly ownId = 'eu'
  readonly started: string[] = []
  readonly ballots: boolean[] = []
  targets = [{ id: 'r1', name: 'RAIDEN' }]

  kickTargets() {
    return this.targets
  }

  kickVote() {
    return undefined
  }

  hostId() {
    return undefined
  }

  startKickVote(targetId: string): void {
    this.started.push(targetId)
  }

  castKickBallot(yes: boolean): void {
    this.ballots.push(yes)
  }
}

describe('syncKickMenu', () => {
  it('escreve o menu só quando a sala muda', () => {
    const session = { state: createMenuState() }
    const written: MenuState[] = []
    const menu = { setState: (state: MenuState) => written.push(state) }
    const network = new FakeKickNetwork()
    syncKickMenu(session, menu, network, 3)
    syncKickMenu(session, menu, network, 3)
    expect(written).toHaveLength(1)
    expect(session.state.kick.targets).toEqual(network.targets)
  })
})

describe('sendKickRequest', () => {
  it('abre o voto contra o escolhido, ou manda o voto', () => {
    const network = new FakeKickNetwork()
    sendKickRequest(network, { ...NO_KICK_MENU, targets: network.targets })
    sendKickRequest(network, { ...NO_KICK_MENU, ballotFor: 'RAIDEN', ballotYes: false })
    sendKickRequest(network, NO_KICK_MENU)
    expect(network.started).toEqual(['r1'])
    expect(network.ballots).toEqual([false])
  })
})
