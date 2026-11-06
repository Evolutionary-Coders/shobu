import type { KickVoteRefusal } from '@shobu/core'
import type { KickVoteNotice, KickVotePort } from '../net/kickVotePort.ts'

/**
 * O que a tela diz de cada aviso do voto de expulsão (ADR 0034): por que o
 * pedido não abriu voto, como o voto acabou, e a entrada desviada de uma sala
 * que baniu este aparelho. O voto nunca diz quem votou o quê.
 *
 * ```ts
 * kickVoteNoticeText({ kind: 'closed', closed: { targetId: 'x', targetName: 'RAIDEN', outcome: 'passed' } }, 3)
 * // 'RAIDEN FOI EXPULSO DA SALA'
 * ```
 */
export function kickVoteNoticeText(notice: KickVoteNotice, minHumans: number): string {
  if (notice.kind === 'refused') return kickRefusalText(notice.reason, minHumans)
  if (notice.kind === 'rerouted') return `VOCÊ FOI EXPULSO DE ${notice.address} · NOVA SALA`
  const name = notice.closed.targetName
  if (notice.closed.outcome === 'passed') return `${name} FOI EXPULSO DA SALA`
  if (notice.closed.outcome === 'failed') return `VOTO CONTRA ${name} FALHOU`
  return `VOTO CONTRA ${name} CANCELADO`
}

/**
 * Por que o pedido não abriu voto, curto: é a mesma frase da linha desabilitada
 * do menu.
 *
 * ```ts
 * kickRefusalText('not-enough-humans', 3) // 'PRECISA DE 3 JOGADORES NA SALA'
 * ```
 */
export function kickRefusalText(reason: KickVoteRefusal, minHumans: number): string {
  if (reason === 'not-enough-humans') return `PRECISA DE ${minHumans} JOGADORES NA SALA`
  return REFUSAL_TEXT[reason]
}

const REFUSAL_TEXT: Readonly<Record<Exclude<KickVoteRefusal, 'not-enough-humans'>, string>> = {
  'target-is-bot': 'BOTS NÃO SÃO EXPULSOS',
  'target-is-self': 'VOCÊ NÃO PODE EXPULSAR A SI MESMO',
  'target-not-seated': 'O JOGADOR JÁ SAIU DA SALA',
  'vote-in-progress': 'JÁ HÁ UMA VOTAÇÃO ABERTA',
  cooldown: 'AGUARDE PARA ABRIR OUTRA VOTAÇÃO',
  'target-protected': 'ESSE JOGADOR ACABOU DE SER VOTADO',
  'join-grace': 'AGUARDE ALGUNS SEGUNDOS NA SALA',
  'not-host': 'SÓ O ANFITRIÃO EXPULSA NA SALA PRIVADA',
  'not-present': 'ENTRE NA PARTIDA PARA VOTAR',
}

/** O que mostra os avisos: a sala, o controle da arena, o menu, o hud e o mínimo que a recusa cita. */
export interface KickNoticeScreen {
  readonly network: Pick<KickVotePort, 'drainKickVoteNotices'>
  readonly renderer: { onPlayerControlChange(listener: (inControl: boolean) => void): void }
  readonly menu: { setNotice(notice: string | null): void }
  readonly hud: { showCallout(text: string): void }
  readonly minHumans: number
  /** A linha EXPULSAR JOGADOR acompanhando a sala, a cada quadro com o menu na tela. */
  syncMenu(): void
}

/**
 * Os avisos do voto de expulsão a cada quadro (`kickVoteNoticeText`): com o
 * menu na tela, como a nota dele; na arena, como a chamada do alto. A nota no
 * menu escondido ficaria velha até a volta a ele. Com o menu na tela, a linha
 * EXPULSAR JOGADOR acompanha a sala no mesmo quadro.
 *
 * ```ts
 * showKickVoteNotices({ network, renderer, menu, hud, minHumans: 3, syncMenu }, requestAnimationFrame)
 * ```
 */
export function showKickVoteNotices(
  screen: KickNoticeScreen,
  nextFrame: (tick: () => void) => unknown,
): void {
  let menuVisible = true
  screen.renderer.onPlayerControlChange((inControl) => {
    menuVisible = !inControl
  })
  const show = (notice: KickVoteNotice): void => {
    const text = kickVoteNoticeText(notice, screen.minHumans)
    if (menuVisible) screen.menu.setNotice(text)
    else screen.hud.showCallout(text)
  }
  const tick = (): void => {
    if (menuVisible) screen.syncMenu()
    screen.network.drainKickVoteNotices(show)
    nextFrame(tick)
  }
  nextFrame(tick)
}
