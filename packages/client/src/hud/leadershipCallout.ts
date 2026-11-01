import type { LeadershipCallout } from '@shobu/core'

/**
 * O texto das falas de liderança, para o hud mostrar quando a voz não tem o
 * take (`hasTake`): a fala nova está no roteiro (`scripts/narrator/lines.md`),
 * mas só vira áudio quando alguém roda a bancada do narrador, e as vozes rvc
 * ficam só no texto. Caixa alta, como o resto do hud.
 */
const LEADERSHIP_CALLOUT_TEXT: Readonly<Record<LeadershipCallout, string>> = {
  'lead-taken': 'ASSUMIU A LIDERANÇA',
  'lead-lost': 'PERDEU A LIDERANÇA',
  'one-kill-left': 'FALTA 1 KILL',
}

/**
 * ```ts
 * leadershipCalloutText('one-kill-left') // 'FALTA 1 KILL'
 * ```
 */
export function leadershipCalloutText(callout: LeadershipCallout): string {
  return LEADERSHIP_CALLOUT_TEXT[callout]
}
