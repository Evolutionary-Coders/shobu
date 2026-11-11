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
 * anterior. Ao perguntar, o ID guardado é esquecido: senão uma recarga do jogo
 * antes de a pessoa nova escolher traria de volta o ID da anterior (review do
 * PR #49). A exceção é a recarga pedida pelo jogo (`takeGameReload`), que é a
 * mesma pessoa no meio da sessão: ela segue com o ID guardado, sem pergunta.
 *
 * ```ts
 * linkFairCredit({ relay: room.fair, store, modal, badge, askOnOpen: !gameReload })
 * ```
 */
export function linkFairCredit(parts: {
  readonly relay: FairCreditRelay
  readonly store: FairUserStore
  readonly modal: Pick<FairUserModal, 'open' | 'onChoose'>
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
  const saved = parts.askOnOpen ? undefined : store.read()
  if (saved !== undefined) {
    apply(saved)
    return
  }
  store.forget()
  modal.open(null)
}
