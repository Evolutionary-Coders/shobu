import type { KickVoteView } from '../net/kickVoteView.ts'

/**
 * Como a faixa do voto de expulsão aparece para este jogador (ADR 0034):
 * - `vote`: vota agora, com os botões SIM e NÃO e as teclas F1 e F2;
 * - `voted`: já votou, e espera o fim;
 * - `target`: o voto é contra ele, que só vê o aviso;
 * - `watch`: chegou depois da abertura e não vota.
 */
export type KickVotePromptMode = 'vote' | 'voted' | 'target' | 'watch'

/** A faixa já escrita: só contagens, nunca quem votou o quê. */
export interface KickVotePrompt {
  readonly title: string
  readonly countdown: string
  readonly tally: string
  readonly mode: KickVotePromptMode
}

/**
 * A faixa do voto aberto, ou `null` sem voto.
 *
 * ```ts
 * kickVotePromptOf(network.kickVote())
 * // { title: 'EXPULSAR RAIDEN?', countdown: '18 S', tally: 'SIM 1/2 · NÃO 0', mode: 'vote' }
 * ```
 */
export function kickVotePromptOf(view: KickVoteView | undefined): KickVotePrompt | null {
  if (!view) return null
  return {
    title: view.isTarget ? 'VOTAÇÃO PARA TE EXPULSAR' : `EXPULSAR ${view.targetName}?`,
    countdown: `${Math.max(0, Math.ceil(view.leftS))} S`,
    tally: `SIM ${view.yes}/${view.needed} · NÃO ${view.no}`,
    mode: modeOf(view),
  }
}

function modeOf(view: KickVoteView): KickVotePromptMode {
  if (view.isTarget) return 'target'
  if (!view.isEligible) return 'watch'
  return view.hasVoted ? 'voted' : 'vote'
}

/**
 * Se duas faixas escrevem o mesmo na tela: o laço roda a cada quadro, e o dom
 * só é tocado quando algo muda — o relógio, uma vez por segundo.
 *
 * ```ts
 * if (!sameKickVotePrompt(shown, next)) hud.setKickVote(next)
 * ```
 */
export function sameKickVotePrompt(a: KickVotePrompt | null, b: KickVotePrompt | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.title === b.title && a.countdown === b.countdown && a.tally === b.tally && a.mode === b.mode
  )
}
