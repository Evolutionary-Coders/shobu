import { SEAT_RESERVATION_S } from '@shobu/core'
import type { SettingsStorage } from '../settings/jsonStore.ts'

/**
 * A reserva de assento que atravessa a recarga da página. Quando a sala tem
 * outro mapa, o cliente recarrega nele sem ocupar o assento, e entra com a
 * mesma reserva depois: soltar o assento e pedir de novo deixava a vaga livre
 * no meio, e o próximo da fila a tomava.
 *
 * A reserva vale `SEAT_RESERVATION_S` no servidor; guardada há mais que isso,
 * menos uma folga para a conexão, ela é jogada fora e o cliente pede outra.
 *
 * ```ts
 * const carry = createSeatCarry(window.sessionStorage, () => Date.now())
 * carry.keep(offer)               // antes de recarregar
 * const carried = carry.take(address) // no boot seguinte, uma vez
 * ```
 */
export interface SeatCarry<Offer> {
  keep(offer: Offer): void
  /** A reserva guardada para este endereço, ainda válida; lida uma vez só. */
  take(address: string): Offer | undefined
}

export const SEAT_CARRY_KEY = 'shobu.carriedSeat'

/** A folga para a página recarregar e o WebSocket abrir antes de a reserva vencer. */
const CONNECT_MARGIN_MS = 3000

export function createSeatCarry<Offer extends { readonly address: string }>(
  storage: SettingsStorage,
  nowMs: () => number,
): SeatCarry<Offer> {
  return {
    keep: (offer) => storage.setItem(SEAT_CARRY_KEY, JSON.stringify({ offer, savedAtMs: nowMs() })),
    take: (address) => {
      const raw = storage.getItem(SEAT_CARRY_KEY)
      // vazio é "nada guardado": o armazenamento do projeto não tem `removeItem`.
      storage.setItem(SEAT_CARRY_KEY, '')
      const carried = parseCarried<Offer>(raw)
      if (!carried || carried.offer.address !== address) return undefined
      const ageMs = nowMs() - carried.savedAtMs
      return ageMs < SEAT_RESERVATION_S * 1000 - CONNECT_MARGIN_MS ? carried.offer : undefined
    },
  }
}

/** O guardado vem do navegador, e pode ser qualquer coisa: o que não é reserva é nada. */
function parseCarried<Offer>(raw: string | null): { offer: Offer; savedAtMs: number } | undefined {
  try {
    const parsed = JSON.parse(raw ?? '') as { offer?: { address?: unknown }; savedAtMs?: unknown }
    if (typeof parsed?.offer?.address !== 'string' || typeof parsed.savedAtMs !== 'number')
      return undefined
    return parsed as { offer: Offer; savedAtMs: number }
  } catch {
    return undefined
  }
}
