import { SEAT_RESERVATION_S } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createMemorySettingsStorage } from '../settings/jsonStore.ts'
import { createSeatCarry, SEAT_CARRY_KEY } from './seatCarry.ts'

interface Offer {
  readonly address: string
  readonly reservation: string
}

const OFFER: Offer = { address: '203.0.113.7', reservation: 'r1' }

/** O relógio dos testes: anda quando o teste manda. */
class FakeClock {
  ms = 1_000_000
  readonly now = (): number => this.ms
}

function carry(): { clock: FakeClock; storage: ReturnType<typeof createMemorySettingsStorage> } {
  return { clock: new FakeClock(), storage: createMemorySettingsStorage() }
}

describe('createSeatCarry', () => {
  it('devolve a reserva guardada para o mesmo endereço, uma vez só', () => {
    const { clock, storage } = carry()
    const seats = createSeatCarry<Offer>(storage, clock.now)
    seats.keep(OFFER)
    clock.ms += 2000
    expect(seats.take(OFFER.address)).toEqual(OFFER)
    expect(seats.take(OFFER.address)).toBeUndefined()
  })

  it('a recarga lê o que a página anterior guardou', () => {
    const { clock, storage } = carry()
    createSeatCarry<Offer>(storage, clock.now).keep(OFFER)
    expect(createSeatCarry<Offer>(storage, clock.now).take(OFFER.address)).toEqual(OFFER)
  })

  it('a reserva de outro endereço não serve, e é jogada fora', () => {
    const { clock, storage } = carry()
    const seats = createSeatCarry<Offer>(storage, clock.now)
    seats.keep(OFFER)
    expect(seats.take('198.51.100.1')).toBeUndefined()
    expect(seats.take(OFFER.address)).toBeUndefined()
  })

  /** Perto de vencer no servidor, a conexão não chegaria a tempo: melhor pedir outra. */
  it('não devolve a reserva perto de vencer', () => {
    const { clock, storage } = carry()
    const seats = createSeatCarry<Offer>(storage, clock.now)
    seats.keep(OFFER)
    clock.ms += SEAT_RESERVATION_S * 1000 - 1000
    expect(seats.take(OFFER.address)).toBeUndefined()
  })

  it.each([null, '', '{', '{"offer":{},"savedAtMs":1}', '{"offer":{"address":"x"}}', 'null'])(
    'guardado que não é reserva é nada: %j',
    (raw) => {
      const { clock, storage } = carry()
      if (raw !== null) storage.setItem(SEAT_CARRY_KEY, raw)
      expect(createSeatCarry<Offer>(storage, clock.now).take('x')).toBeUndefined()
    },
  )
})
