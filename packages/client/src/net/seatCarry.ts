import { SEAT_RESERVATION_S } from '@shobu/core'
import type { SettingsStorage } from '../settings/jsonStore.ts'

/**
 * O assento que atravessa a recarga da página, de dois jeitos:
 *
 * - a reserva (`offer`): quando a sala tem outro mapa, o cliente recarrega
 *   nele sem ocupar o assento, e entra com a mesma reserva depois. Soltar o
 *   assento e pedir de novo deixava a vaga livre no meio, e o próximo da fila
 *   a tomava.
 * - a volta (`reconnect`): quando o voto troca o mapa da sala em que se joga
 *   (ADR 0031), o cliente recarrega no novo e volta à mesma vaga com o token
 *   de reconexão, que a sala guarda pela janela da reserva.
 *
 * Os dois valem `SEAT_RESERVATION_S` no servidor; guardados há mais que isso,
 * menos uma folga para a conexão, são jogados fora e o cliente pede outro.
 *
 * ```ts
 * const carry = createSeatCarry(window.sessionStorage, () => Date.now())
 * carry.keep(offer)                  // antes de recarregar
 * const carried = carry.take(address) // no boot seguinte, uma vez
 * ```
 */
export interface SeatCarry<Offer> {
  keep(offer: Offer): void
  /** A volta à vaga da sala em `address`, pelo token de reconexão dela. */
  keepReconnect(address: string, token: string): void
  /** O assento guardado para este endereço, ainda válido; lido uma vez só. */
  take(address: string): CarriedSeat<Offer> | undefined
}

export type CarriedSeat<Offer> =
  | { readonly kind: 'offer'; readonly offer: Offer }
  | { readonly kind: 'reconnect'; readonly address: string; readonly token: string }

export const SEAT_CARRY_KEY = 'shobu.carriedSeat'

/** A folga para a página recarregar e o WebSocket abrir antes de a reserva vencer. */
const CONNECT_MARGIN_MS = 3000

export function createSeatCarry<Offer extends { readonly address: string }>(
  storage: SettingsStorage,
  nowMs: () => number,
): SeatCarry<Offer> {
  const save = (seat: CarriedSeat<Offer>): void =>
    storage.setItem(SEAT_CARRY_KEY, JSON.stringify({ seat, savedAtMs: nowMs() }))
  return {
    keep: (offer) => save({ kind: 'offer', offer }),
    keepReconnect: (address, token) => save({ kind: 'reconnect', address, token }),
    take: (address) => {
      const raw = storage.getItem(SEAT_CARRY_KEY)
      // vazio é "nada guardado": o armazenamento do projeto não tem `removeItem`.
      storage.setItem(SEAT_CARRY_KEY, '')
      const carried = parseCarried<Offer>(raw)
      if (!carried || addressOf(carried.seat) !== address) return undefined
      const ageMs = nowMs() - carried.savedAtMs
      return ageMs < SEAT_RESERVATION_S * 1000 - CONNECT_MARGIN_MS ? carried.seat : undefined
    },
  }
}

function addressOf<Offer extends { readonly address: string }>(seat: CarriedSeat<Offer>): string {
  return seat.kind === 'offer' ? seat.offer.address : seat.address
}

interface StoredSeat<Offer> {
  readonly seat: CarriedSeat<Offer>
  readonly savedAtMs: number
}

/** O guardado vem do navegador, e pode ser qualquer coisa: o que não é assento é nada. */
function parseCarried<Offer>(raw: string | null): StoredSeat<Offer> | undefined {
  try {
    const parsed = JSON.parse(raw ?? '') as { seat?: Record<string, unknown>; savedAtMs?: unknown }
    if (typeof parsed?.savedAtMs !== 'number' || !isCarriedSeat(parsed.seat)) return undefined
    return parsed as StoredSeat<Offer>
  } catch {
    return undefined
  }
}

function isCarriedSeat(seat: Record<string, unknown> | undefined): boolean {
  if (seat?.kind === 'reconnect') {
    return typeof seat.address === 'string' && typeof seat.token === 'string'
  }
  const offer = seat?.offer as { address?: unknown } | undefined
  return seat?.kind === 'offer' && typeof offer?.address === 'string'
}
