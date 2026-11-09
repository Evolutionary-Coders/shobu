import { readIdTokenClaims } from '@shobu/core'
import type { FairBadge } from './fairBadge.ts'
import type { FairCreditRelay } from './fairCreditRelay.ts'
import { fairCreditText } from './fairCreditText.ts'
import type { GoogleSignIn } from './googleSignIn.ts'

/**
 * O login do Google e o crédito da Feira ligados (ADR 0036): o token vai à
 * sala pelo relay e o nome da conta ao selo; o crédito do fim da partida vai
 * ao selo, e o token vencido pede um novo ao Google, que o relay leva à sala,
 * e a sala paga o que tinha guardado. Abre já pedindo o login: quem entrou
 * antes volta logado sem clicar (`auto_select`).
 *
 * ```ts
 * linkFairCredit(room.fair, loadGoogleSignIn(document, clientId), mountFairBadge(document))
 * ```
 */
export function linkFairCredit(
  relay: FairCreditRelay,
  signIn: GoogleSignIn,
  badge: Pick<FairBadge, 'buttonSlot' | 'setAccount' | 'showCredit'>,
): void {
  signIn.onCredential((credential) => {
    relay.chooseCredential(credential)
    badge.setAccount(readIdTokenClaims(credential)?.name ?? '')
  })
  relay.onCredit((credit) => {
    const text = fairCreditText(credit)
    if (text) badge.showCredit(text)
    if (credit.status === 'expired') signIn.refresh()
  })
  signIn.renderButton(badge.buttonSlot)
  signIn.refresh()
}
