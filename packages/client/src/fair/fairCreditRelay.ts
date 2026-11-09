import type { FairCreditMessage } from '@shobu/core'
import type { GameLink } from '../net/gameLink.ts'

/** O pedaço do link que o crédito da Feira usa. */
export type FairLink = Pick<GameLink, 'sendFairCredential' | 'onFairCredit'>

/**
 * O login da Feira entre o Google e a sala (ADR 0036): guarda o último token e
 * o manda a cada sala que chega, como o nome de perfil (`resendProfile`), e
 * repassa o crédito que a sala avisa no fim da partida.
 */
export interface FairCreditRelay {
  /** A sala nova: recebe o token que já houver, e passa a avisar o crédito. */
  attach(link: FairLink): void
  /** O token novo do Google: vai à sala agora, ou à próxima que chegar. */
  chooseCredential(credential: string): void
  /** Cada crédito que a sala avisa a este jogador. */
  onCredit(listener: (credit: FairCreditMessage) => void): void
}

/**
 * ```ts
 * const fair = createFairCreditRelay()
 * fair.attach(link)
 * signIn.onCredential(fair.chooseCredential)
 * ```
 */
export function createFairCreditRelay(): FairCreditRelay {
  let link: FairLink | undefined
  let credential: string | undefined
  const listeners: ((credit: FairCreditMessage) => void)[] = []
  return {
    attach: (next) => {
      link = next
      if (credential !== undefined) next.sendFairCredential(credential)
      next.onFairCredit((credit) => {
        if (link !== next) return
        for (const listener of listeners) listener(credit)
      })
    },
    chooseCredential: (next) => {
      credential = next
      link?.sendFairCredential(next)
    },
    onCredit: (listener) => {
      listeners.push(listener)
    },
  }
}
