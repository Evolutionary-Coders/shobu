import type { FairBadge } from './fairBadge.ts'
import type { FairCreditRelay } from './fairCreditRelay.ts'
import { fairCreditText } from './fairCreditText.ts'
import type { FairUserModal } from './fairUserModal.ts'
import type { FairUserStore } from './fairUserStore.ts'

/**
 * O ID da Feira e o crédito ligados (ADR 0037): o ID escolhido no modal vai à
 * sala pelo relay, ao selo e ao armazenamento da aba; o botão do selo reabre
 * o modal; o crédito do fim da partida vai ao selo.
 *
 * O modal abre vazio a cada página aberta (`askOnOpen`): no estande a máquina
 * passa de mão em mão sem fechar a aba, e um ID lembrado creditaria a pessoa
 * anterior. A exceção é a recarga da troca de mapa, que é a mesma pessoa no
 * meio da sessão: ela segue com o ID guardado na aba, sem pergunta. Se a aba
 * ainda não escolheu nada, o modal abre de qualquer jeito.
 *
 * ```ts
 * linkFairCredit({ relay: room.fair, store, modal, badge, askOnOpen: !rematch.pending })
 * ```
 */
export function linkFairCredit(parts: {
  readonly relay: FairCreditRelay
  readonly store: FairUserStore
  readonly modal: FairUserModal
  readonly badge: Pick<FairBadge, 'setUser' | 'showCredit' | 'onChangeRequest'>
  readonly askOnOpen: boolean
}): void {
  const { relay, store, modal, badge } = parts
  const apply = (userId: number | null) => {
    relay.chooseUser(userId)
    badge.setUser(userId)
  }
  modal.onChoose((userId) => {
    store.write(userId)
    apply(userId)
  })
  badge.onChangeRequest(() => modal.open(store.read() ?? null))
  relay.onCredit((credit) => {
    const text = fairCreditText(credit)
    if (text) badge.showCredit(text)
  })
  const saved = store.read()
  if (parts.askOnOpen || saved === undefined) modal.open(null)
  else apply(saved)
}
