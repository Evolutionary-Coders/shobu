import { MAP_RELOAD_HOLD_S, SEAT_RESERVATION_S } from '@shobu/core'
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
    expect(seats.take(OFFER.address)).toEqual({ kind: 'offer', offer: OFFER })
    expect(seats.take(OFFER.address)).toBeUndefined()
  })

  it('a recarga lê o que a página anterior guardou', () => {
    const { clock, storage } = carry()
    createSeatCarry<Offer>(storage, clock.now).keep(OFFER)
    expect(createSeatCarry<Offer>(storage, clock.now).take(OFFER.address)).toEqual({
      kind: 'offer',
      offer: OFFER,
    })
  })

  /** A troca de mapa pelo voto: a página volta à mesma vaga com o token (ADR 0031). */
  it('guarda a volta à vaga com o token, pelo endereço da sala', () => {
    const { clock, storage } = carry()
    createSeatCarry<Offer>(storage, clock.now).keepReconnect(OFFER.address, 'tk')
    const seats = createSeatCarry<Offer>(storage, clock.now)
    expect(seats.take(OFFER.address)).toEqual({
      kind: 'reconnect',
      address: OFFER.address,
      token: 'tk',
    })
  })

  it('a volta de outro endereço não serve', () => {
    const { clock, storage } = carry()
    const seats = createSeatCarry<Offer>(storage, clock.now)
    seats.keepReconnect(OFFER.address, 'tk')
    expect(seats.take('198.51.100.1')).toBeUndefined()
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

  /** Regressão: a volta valia só a reserva, e a recarga lenta perdia a vaga que a sala segurava. */
  it('a volta ao mapa novo vale a espera da troca, além da reserva', () => {
    const { clock, storage } = carry()
    const seats = createSeatCarry<Offer>(storage, clock.now)
    seats.keepReconnect(OFFER.address, 'token')
    clock.ms += SEAT_RESERVATION_S * 1000 + 10_000
    expect(seats.take(OFFER.address)).toEqual({
      kind: 'reconnect',
      address: OFFER.address,
      token: 'token',
    })
    seats.keepReconnect(OFFER.address, 'token')
    clock.ms += MAP_RELOAD_HOLD_S * 1000
    expect(seats.take(OFFER.address)).toBeUndefined()
  })

  it.each([
    null,
    '',
    '{',
    'null',
    '{"seat":{"kind":"offer","offer":{}},"savedAtMs":1}',
    '{"seat":{"kind":"offer","offer":{"address":"x"}}}',
    '{"seat":{"kind":"reconnect","address":"x"},"savedAtMs":1}',
    '{"seat":{"kind":"outro","address":"x"},"savedAtMs":1}',
    '{"offer":{"address":"x"},"savedAtMs":1}',
  ])('guardado que não é assento é nada: %j', (raw) => {
    const { clock, storage } = carry()
    if (raw !== null) storage.setItem(SEAT_CARRY_KEY, raw)
    expect(createSeatCarry<Offer>(storage, clock.now).take('x')).toBeUndefined()
  })
})
