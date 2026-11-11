import { tabStorage } from '../matchEnd/rematchWiring.ts'
import type { ArenaRenderer } from '../renderer/arenaRenderer.ts'
import { takeGameReload } from '../settings/gameReloadMark.ts'
import { mountFairBadge } from './fairBadge.ts'
import type { FairCreditRelay } from './fairCreditRelay.ts'
import { mountFairUserModal } from './fairUserModal.ts'
import { createFairUserStore } from './fairUserStore.ts'
import { linkFairCredit } from './linkFairCredit.ts'

/**
 * O selo e o modal do ID da Feira montados nesta página (ADR 0037). O selo
 * mostra o ID enquanto o menu está na tela; o que liga uma coisa à outra é
 * `linkFairCredit`. Só a recarga pedida pelo jogo (`takeGameReload`) não
 * pergunta o ID de novo. Montado com o menu já na tela: o foco no campo do
 * modal só pega num elemento visível. O jogador que entra no jogo por baixo do
 * modal (o controle não passa por ele) o fecha sem escolher.
 *
 * ```ts
 * mountFairCredit(room.fair, renderer) // depois do overlay.setPhase('ready')
 * ```
 */
export function mountFairCredit(
  relay: FairCreditRelay,
  renderer: Pick<ArenaRenderer, 'onPlayerControlChange'>,
): void {
  const badge = mountFairBadge(document.body)
  const modal = mountFairUserModal(document.body)
  const tab = tabStorage()
  const askOnOpen = !takeGameReload(tab)
  linkFairCredit({ relay, store: createFairUserStore(tab), modal, badge, askOnOpen })
  renderer.onPlayerControlChange((inControl) => {
    badge.setMenuVisible(!inControl)
    if (inControl) modal.dismiss()
  })
}
