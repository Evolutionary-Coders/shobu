import { createKillEvent, type KillEvent, type WireInput } from '@shobu/core'
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
  alive: true,
}

/** A sala do colyseus, em memória: guarda o que recebeu e devolve um jogador remoto. */
class FakeGameLink implements GameLink {
  readonly sessionId = 'eu'
  readonly address = '203.0.113.7'
  readonly sent: WireInput[] = []

  sendTickInput(input: WireInput): number {
    this.sent.push({ ...input })
    return this.sent.length
  }

  acked = 0

  lastProcessed(): number {
    return this.acked
  }

  forEachRemote(
    _nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void {
    visit('outro', AT_SPAWN)
  }

  own: PlayerSnapshotFields | undefined = undefined

  ownSnapshot(): PlayerSnapshotFields | undefined {
    return this.own
  }

  #killListener: (kill: KillEvent) => void = () => {}

  onKill(listener: (kill: KillEvent) => void): void {
    this.#killListener = listener
  }

  /** O servidor confirmando uma kill deste jogador. */
  confirmKill(victimId: string): void {
    this.#killListener({ ...createKillEvent(), shooterId: 'local', victimId })
  }

  onMove(): void {}
  onVoiceTicket(): void {}

  async leave(): Promise<void> {}
}

describe('drainKills', () => {
  it('entrega cada kill confirmada uma vez, na ordem', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.confirmKill('bia')
    link.confirmKill('caio')
    const first: string[] = []
    port.drainKills((kill) => first.push(kill.victimId))
    const second: string[] = []
    port.drainKills((kill) => second.push(kill.victimId))
    expect(first).toEqual(['bia', 'caio'])
    expect(second).toEqual([])
  })
})

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
    expect(port.sendTickInput(WALK)).toBe(1)
    const visited: string[] = []
    port.forEachRemote(0, (id) => visited.push(id))
    expect(link.sent).toEqual([WALK])
    expect(visited).toEqual(['outro'])
    expect(port.connected).toBe(true)
  })

  it('entrega o spawn do servidor uma vez, quando o próprio estado chega', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    expect(port.takeOwnSpawn()).toBeUndefined()
    port.attach(link)
    expect(port.takeOwnSpawn()).toBeUndefined()
    link.own = AT_SPAWN
    expect(port.takeOwnSpawn()).toEqual({ x: 26, y: 0, z: 26 })
    expect(port.takeOwnSpawn()).toBeUndefined()
  })

  it('entrega a confirmação do servidor só com sala e com o próprio estado', () => {
    const port = createNetworkPort()
    expect(port.confirmation()).toBeUndefined()
    const link = new FakeGameLink()
    port.attach(link)
    expect(port.confirmation()).toBeUndefined()
    link.own = AT_SPAWN
    link.acked = 7
    expect(port.confirmation()).toEqual({ ackSeq: 7, own: AT_SPAWN })
  })
})
