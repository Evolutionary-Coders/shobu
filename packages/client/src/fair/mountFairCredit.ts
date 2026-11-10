import { tabStorage } from '../matchEnd/rematchWiring.ts'
import type { ArenaRenderer } from '../renderer/arenaRenderer.ts'
import { mountFairBadge } from './fairBadge.ts'
import type { FairCreditRelay } from './fairCreditRelay.ts'
import { mountFairUserModal } from './fairUserModal.ts'
import { createFairUserStore } from './fairUserStore.ts'
import { linkFairCredit } from './linkFairCredit.ts'

/**
 * O selo e o modal do ID da Feira montados nesta página (ADR 0037). O selo
 * mostra o ID enquanto o menu está na tela; o que liga uma coisa à outra é
 * `linkFairCredit`. `mapReload` é a recarga da troca de mapa, a única que não
 * pergunta o ID de novo.
 *
 * ```ts
 * mountFairCredit(room.fair, renderer, rematch.pending !== null)
 * ```
 */
export function mountFairCredit(
  relay: FairCreditRelay,
  renderer: Pick<ArenaRenderer, 'onPlayerControlChange'>,
  mapReload: boolean,
): void {
  const badge = mountFairBadge(document.body)
  const modal = mountFairUserModal(document.body)
  const store = createFairUserStore(tabStorage())
  linkFairCredit({ relay, store, modal, badge, askOnOpen: !mapReload })
  renderer.onPlayerControlChange((inControl) => badge.setMenuVisible(!inControl))
}
