import { describe, expect, it, vi } from 'vitest'
import { createRoomFollower, type FollowedRoom, type RoomFollowerPorts } from './roomFollower.ts'

const BOOTED = 'neon-kaido'
const OTHER = 'ichiban-gai'

/** Uma sala do servidor de jogo, em memória: guarda a chamada da fila para o teste disparar. */
class FakeRoom implements FollowedRoom<FakeRoom> {
  left = false
  #move: ((follow: () => Promise<FakeRoom>) => void) | undefined

  constructor(
    readonly address: string,
    readonly arenaId: string,
  ) {}

  async leave(): Promise<void> {
    this.left = true
  }

  onMove(listener: (follow: () => Promise<FakeRoom>) => void): void {
    this.#move = listener
  }

  /** O servidor chamando da fila: a troca leva a `next`, ou falha. */
  callFromQueue(next: FakeRoom | Error): void {
    this.#move?.(async () => {
      if (next instanceof Error) throw next
      return next
    })
  }
}

/** A cena, a url e a página, em ordem: cada passo vira uma linha. */
class FakePage implements RoomFollowerPorts<FakeRoom> {
  readonly bootedArenaId = BOOTED
  readonly catalogIds = [BOOTED, OTHER]
  readonly steps: string[] = []
  attach(link: FakeRoom): void {
    this.steps.push(`attach ${link.address}`)
  }
  showAddress(address: string): void {
    this.steps.push(`url ${address}`)
  }
  reloadInto(arenaId: string): void {
    this.steps.push(`reload ${arenaId}`)
  }
  onMoveFailed(reason: unknown): void {
    this.steps.push(`failed ${String(reason)}`)
  }
}

function follower(): { page: FakePage; follow: (link: FakeRoom) => void } {
  const page = new FakePage()
  return { page, follow: createRoomFollower(page) }
}

describe('createRoomFollower', () => {
  it('na sala do mapa subido, mostra o endereço e liga a sala', () => {
    const { page, follow } = follower()
    follow(new FakeRoom('203.0.113.7', BOOTED))
    expect(page.steps).toEqual(['url 203.0.113.7', 'attach 203.0.113.7'])
  })

  it('na sala de outro mapa, sai dela e recarrega no mapa dela, sem ligar nada', async () => {
    const { page, follow } = follower()
    const room = new FakeRoom('203.0.113.7', OTHER)
    follow(room)
    await vi.waitFor(() => expect(page.steps).toEqual([`reload ${OTHER}`]))
    expect(room.left).toBe(true)
  })

  it('com um mapa que este cliente não conhece, joga nele sem recarregar', () => {
    const { page, follow } = follower()
    follow(new FakeRoom('203.0.113.7', 'mapa-futuro'))
    expect(page.steps).toEqual(['url 203.0.113.7', 'attach 203.0.113.7'])
  })

  it('chamado da fila para o mesmo mapa, liga a sala pedida', async () => {
    const { page, follow } = follower()
    const provisional = new FakeRoom('198.51.100.9', BOOTED)
    follow(provisional)
    provisional.callFromQueue(new FakeRoom('203.0.113.7', BOOTED))
    await vi.waitFor(() => expect(page.steps.at(-1)).toBe('attach 203.0.113.7'))
  })

  /**
   * Regressão: a recarga saía antes de a url mudar, voltava à sala provisória,
   * e o assento reservado na sala pedida ia para o próximo da fila.
   */
  it('chamado da fila para outro mapa, põe a sala pedida na url antes de recarregar', async () => {
    const { page, follow } = follower()
    const provisional = new FakeRoom('198.51.100.9', BOOTED)
    follow(provisional)
    provisional.callFromQueue(new FakeRoom('203.0.113.7', OTHER))
    await vi.waitFor(() => expect(page.steps.at(-1)).toBe(`reload ${OTHER}`))
    expect(page.steps.slice(2)).toEqual(['url 203.0.113.7', `reload ${OTHER}`])
  })

  it('a troca que falha é avisada, e a sala provisória segue', async () => {
    const { page, follow } = follower()
    const provisional = new FakeRoom('198.51.100.9', BOOTED)
    follow(provisional)
    provisional.callFromQueue(new Error('sala cheia'))
    await vi.waitFor(() => expect(page.steps.at(-1)).toBe('failed Error: sala cheia'))
  })
})
