import type { ArenaRenderer } from '../renderer/arenaRenderer.ts'
import { mountFairBadge } from './fairBadge.ts'
import { googleClientIdOf } from './fairClientId.ts'
import type { FairCreditRelay } from './fairCreditRelay.ts'
import { loadGoogleSignIn } from './googleSignIn.ts'
import { linkFairCredit } from './linkFairCredit.ts'

/**
 * O selo da Feira e o login do Google montados nesta página (ADR 0036), só
 * com client id (`googleClientIdOf`). O selo mostra a conta enquanto o menu
 * está na tela; o que liga uma coisa à outra é `linkFairCredit`.
 *
 * ```ts
 * mountFairCredit(room.fair, renderer)
 * ```
 */
export function mountFairCredit(
  relay: FairCreditRelay,
  renderer: Pick<ArenaRenderer, 'onPlayerControlChange'>,
): void {
  const clientId = googleClientIdOf(import.meta.env)
  if (!clientId) return
  const badge = mountFairBadge(document.body)
  linkFairCredit(relay, loadGoogleSignIn(document, clientId), badge)
  renderer.onPlayerControlChange((inControl) => badge.setMenuVisible(!inControl))
}
