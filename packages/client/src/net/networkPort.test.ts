import { createKillEvent, type KillEvent, quantizePositionM, type WireInput } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { GameLink } from './gameLink.ts'
import { createNetworkPort } from './networkPort.ts'
import type { PlayerSnapshotFields } from './remotePlayerView.ts'

const WALK: WireInput = { wishX: 0, wishZ: -127, buttons: 0, aimX: 0, aimY: 0, aimZ: -32767 }
const AT_SPAWN: PlayerSnapshotFields = {
  x: quantizePositionM(26),
  y: 0,
  z: quantizePositionM(26),
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

  #boundaryListener: (playerId: string) => void = () => {}

  onBoundaryDeath(listener: (playerId: string) => void): void {
    this.#boundaryListener = listener
  }

  /** O servidor avisando que alguém morreu fora da área. */
  boundaryDeath(playerId: string): void {
    this.#boundaryListener(playerId)
  }

  readonly loadouts: string[] = []

  sendLoadout(meleeWeapon: string): void {
    this.loadouts.push(meleeWeapon)
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

describe('drainBoundaryDeaths', () => {
  it('entrega cada morte fora da área uma vez, na ordem', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.boundaryDeath('bia')
    link.boundaryDeath('eu')
    const deaths: string[] = []
    port.drainBoundaryDeaths((playerId) => deaths.push(playerId))
    port.drainBoundaryDeaths((playerId) => deaths.push(playerId))
    expect(deaths).toEqual(['bia', 'eu'])
  })
})

describe('chooseMelee', () => {
  /** A classe é escolhida no menu, quase sempre antes de a sala conectar. */
  it('guarda a lâmina escolhida antes da sala e a manda quando ela chega', () => {
    const port = createNetworkPort()
    port.chooseMelee('knife')
    const link = new FakeGameLink()
    port.attach(link)
    port.chooseMelee('katana')
    expect(link.loadouts).toEqual(['knife', 'katana'])
  })

  it('sem escolha, não manda nada ao conectar', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    expect(link.loadouts).toEqual([])
  })
})

describe('createNetworkPort', () => {
  it('sabe o próprio id só com sala', () => {
    const port = createNetworkPort()
    expect(port.ownId).toBeUndefined()
    port.attach(new FakeGameLink())
    expect(port.ownId).toBe('eu')
  })

  /** O respawn é do servidor: o cliente renasce onde o patch diz, quando ele volta a vivo. */
  it('entrega o spawn de novo a cada volta da morte', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    port.attach(link)
    link.own = AT_SPAWN
    expect(port.takeOwnSpawn()).toEqual({ x: 26, y: 0, z: 26 })
    link.own = { ...AT_SPAWN, alive: false }
    expect(port.takeOwnSpawn()).toBeUndefined()
    link.own = { ...AT_SPAWN, x: quantizePositionM(-5) }
    expect(port.takeOwnSpawn()).toEqual({ x: -5, y: 0, z: 26 })
    expect(port.takeOwnSpawn()).toBeUndefined()
  })

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
