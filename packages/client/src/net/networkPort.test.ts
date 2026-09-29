import type { WireInput } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { GameLink } from './gameLink.ts'
import { createNetworkPort } from './networkPort.ts'
import type { PlayerSnapshotFields } from './remotePlayerView.ts'

const WALK: WireInput = { wishX: 0, wishZ: -127, buttons: 0, aimX: 0, aimY: 0, aimZ: -32767 }
const AT_SPAWN: PlayerSnapshotFields = {
  x: 26000,
  y: 0,
  z: 26000,
  aimX: 0,
  aimY: 0,
  aimZ: -32767,
  stance: 4,
}

/** A sala do colyseus, em memória: guarda o que recebeu e devolve um jogador remoto. */
class FakeGameLink implements GameLink {
  readonly sessionId = 'eu'
  readonly sent: WireInput[] = []

  sendTickInput(input: WireInput): void {
    this.sent.push({ ...input })
  }

  forEachRemote(
    _nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void {
    visit('outro', AT_SPAWN)
  }

  async leave(): Promise<void> {}
}

describe('createNetworkPort', () => {
  it('roda sozinho antes da conexão, sem erro e sem remoto', () => {
    const port = createNetworkPort()
    const visited: string[] = []
    port.sendTickInput(WALK)
    port.forEachRemote(0, (id) => visited.push(id))
    expect(visited).toEqual([])
    expect(port.connected).toBe(false)
  })

  it('passa a falar com a sala depois do attach', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    port.sendTickInput(WALK)
    const visited: string[] = []
    port.forEachRemote(0, (id) => visited.push(id))
    expect(link.sent).toEqual([WALK])
    expect(visited).toEqual(['outro'])
    expect(port.connected).toBe(true)
  })
})
