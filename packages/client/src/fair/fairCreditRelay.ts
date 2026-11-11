import type { FairCreditMessage } from '@shobu/core'
import type { GameLink } from '../net/gameLink.ts'

/** O pedaço do link que o crédito da Feira usa. */
export type FairLink = Pick<GameLink, 'sendFairUser' | 'onFairCredit' | 'onClose'>

/**
 * O ID da Feira entre o modal e a sala (ADR 0037): guarda o último ID e o
 * manda a cada sala que chega, como o nome de perfil (`resendProfile`), e
 * repassa o crédito que a sala avisa no fim da partida.
 */
export interface FairCreditRelay {
  /** A sala nova: recebe o ID que já houver, e passa a avisar o crédito. */
  attach(link: FairLink): void
  /** O ID escolhido no modal, ou `null` sem ID: vai à sala agora, ou à próxima. */
  chooseUser(userId: number | null): void
  /** Cada crédito que a sala avisa a este jogador. */
  onCredit(listener: (credit: FairCreditMessage) => void): void
}

/**
 * ```ts
 * const fair = createFairCreditRelay()
 * fair.attach(link)
 * fair.chooseUser(42)
 * ```
 */
export function createFairCreditRelay(): FairCreditRelay {
  let link: FairLink | undefined
  let userId: number | null = null
  const listeners: ((credit: FairCreditMessage) => void)[] = []
  return {
    attach: (next) => {
      link = next
      // a sala nova não conhece ID nenhum: o `null` só serve para apagar.
      if (userId !== null) next.sendFairUser(userId)
      next.onFairCredit((credit) => {
        if (link !== next) return
        for (const listener of listeners) listener(credit)
      })
      // a sala que fecha solta o lugar, como no `networkPort`: o ID trocado
      // espera a próxima, em vez de ir para uma conexão morta.
      next.onClose(() => {
        if (link === next) link = undefined
      })
    },
    chooseUser: (next) => {
      userId = next
      link?.sendFairUser(next)
    },
    onCredit: (listener) => {
      listeners.push(listener)
    },
  }
}
