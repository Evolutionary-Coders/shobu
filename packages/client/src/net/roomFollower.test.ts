import { describe, expect, it, vi } from 'vitest'
import {
  createRoomFollower,
  type FollowedRoom,
  type OfferedSeat,
  type RoomFollowerPorts,
} from './roomFollower.ts'

const BOOTED = 'neon-kaido'
const OTHER = 'ichiban-gai'

/** Uma sala do servidor de jogo, em memória: guarda a chamada da fila para o teste disparar. */
class FakeRoom implements FollowedRoom<FakeSeat> {
  left = false
  #move: ((next: FakeSeat) => void) | undefined

  constructor(readonly address: string) {}

  async leave(): Promise<void> {
    this.left = true
  }

  onMove(listener: (next: FakeSeat) => void): void {
    this.#move = listener
  }

  /** O servidor chamando da fila com um assento reservado. */
  callFromQueue(seat: FakeSeat): void {
    this.#move?.(seat)
  }
}

/** Um assento reservado: ocupá-lo abre a sala, ou falha. */
class FakeSeat implements OfferedSeat<FakeRoom> {
  room: FakeRoom | undefined

  constructor(
    readonly address: string,
    readonly arenaId: string,
    readonly failure?: Error,
  ) {}

  async take(): Promise<FakeRoom> {
    if (this.failure) throw this.failure
    this.room = new FakeRoom(this.address)
    return this.room
  }
}

/** A cena, a url, a página e a reserva guardada, em ordem: cada passo vira uma linha. */
class FakePage implements RoomFollowerPorts<FakeRoom, FakeSeat> {
  readonly bootedArenaId = BOOTED
  readonly catalogIds = [BOOTED, OTHER]
  readonly steps: string[] = []
  attach(link: FakeRoom): void {
    this.steps.push(`attach ${link.address}`)
  }
  showAddress(address: string): void {
    this.steps.push(`url ${address}`)
  }
  keepSeat(seat: FakeSeat): void {
    this.steps.push(`keep ${seat.address}`)
  }
  reloadInto(arenaId: string): void {
    this.steps.push(`reload ${arenaId}`)
  }
  onEnterFailed(reason: unknown): void {
    this.steps.push(`failed ${String(reason)}`)
  }
}

function follower(): { page: FakePage; follow: (seat: FakeSeat) => void } {
  const page = new FakePage()
  return { page, follow: createRoomFollower(page) }
}

/** Entra numa sala provisória do mapa subido e devolve o link dela. */
async function enterProvisional(
  page: FakePage,
  follow: (seat: FakeSeat) => void,
): Promise<FakeRoom> {
  const seat = new FakeSeat('198.51.100.9', BOOTED)
  follow(seat)
  await vi.waitFor(() => expect(page.steps).toContain('attach 198.51.100.9'))
  return seat.room as FakeRoom
}

describe('createRoomFollower', () => {
  it('na sala do mapa subido, ocupa o assento, mostra o endereço e liga a sala', async () => {
    const { page, follow } = follower()
    follow(new FakeSeat('203.0.113.7', BOOTED))
    await vi.waitFor(() => expect(page.steps).toEqual(['url 203.0.113.7', 'attach 203.0.113.7']))
  })

  /**
   * Regressão: o cliente ocupava o assento, saía para recarregar e pedia de
   * novo; no meio, a vaga ficava livre e o próximo da fila a tomava.
   */
  it('na sala de outro mapa, guarda a reserva sem ocupá-la e recarrega no mapa dela', async () => {
    const { page, follow } = follower()
    const seat = new FakeSeat('203.0.113.7', OTHER)
    follow(seat)
    await vi.waitFor(() =>
      expect(page.steps).toEqual(['keep 203.0.113.7', 'url 203.0.113.7', `reload ${OTHER}`]),
    )
    expect(seat.room).toBeUndefined()
  })

  it('com um mapa que este cliente não conhece, joga nele sem recarregar', async () => {
    const { page, follow } = follower()
    follow(new FakeSeat('203.0.113.7', 'mapa-futuro'))
    await vi.waitFor(() => expect(page.steps).toEqual(['url 203.0.113.7', 'attach 203.0.113.7']))
  })

  it('chamado da fila para o mesmo mapa, ocupa a sala pedida e só então sai da provisória', async () => {
    const { page, follow } = follower()
    const provisional = await enterProvisional(page, follow)
    provisional.callFromQueue(new FakeSeat('203.0.113.7', BOOTED))
    await vi.waitFor(() => expect(page.steps.at(-1)).toBe('attach 203.0.113.7'))
    expect(provisional.left).toBe(true)
  })

  it('chamado da fila para outro mapa, guarda a reserva, sai da provisória e recarrega', async () => {
    const { page, follow } = follower()
    const provisional = await enterProvisional(page, follow)
    const seat = new FakeSeat('203.0.113.7', OTHER)
    provisional.callFromQueue(seat)
    await vi.waitFor(() => expect(page.steps.at(-1)).toBe(`reload ${OTHER}`))
    expect(page.steps.slice(2)).toEqual(['keep 203.0.113.7', 'url 203.0.113.7', `reload ${OTHER}`])
    expect(provisional.left).toBe(true)
    expect(seat.room).toBeUndefined()
  })

  it('a troca que falha é avisada, e a sala provisória segue', async () => {
    const { page, follow } = follower()
    const provisional = await enterProvisional(page, follow)
    provisional.callFromQueue(new FakeSeat('203.0.113.7', BOOTED, new Error('sala cheia')))
    await vi.waitFor(() => expect(page.steps.at(-1)).toBe('failed Error: sala cheia'))
    expect(provisional.left).toBe(false)
  })
})
