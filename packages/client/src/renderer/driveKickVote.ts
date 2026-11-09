import type { Scene } from '@babylonjs/core/scene.js'
import { kickBallotForKey } from '../controller/kickVoteKeys.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import { type KickVotePrompt, kickVotePromptOf, sameKickVotePrompt } from '../hud/kickVotePrompt.ts'
import type { NetworkPort } from '../net/networkPort.ts'

/**
 * O voto de expulsão aberto na tela e o voto deste jogador (ADR 0034): a
 * faixa do hud muda só quando o texto muda (`sameKickVotePrompt`); F1 e F2 —
 * ou Y e N — votam com o ponteiro travado, e os botões da camada de toque
 * votam no celular. As teclas só valem enquanto o jogador ainda vota: fora
 * disso, F1 é a ajuda do navegador e Y e N são de quem digita.
 *
 * ```ts
 * if (options.network) driveKickVote(scene, options.network, hud, options.canvas.ownerDocument)
 * ```
 */
export function driveKickVote(
  scene: Scene,
  network: Pick<NetworkPort, 'kickVote' | 'castKickBallot'>,
  hud: Pick<ArenaHud, 'setKickVote'>,
  doc: Document,
): void {
  const touchBallots = mountTouchBallots(doc)
  const shown: { prompt: KickVotePrompt | null } = { prompt: null }
  scene.onBeforeRenderObservable.add(() => {
    const next = kickVotePromptOf(network.kickVote())
    if (sameKickVotePrompt(shown.prompt, next)) return
    shown.prompt = next
    hud.setKickVote(next)
    touchBallots.hidden = next?.mode !== 'vote'
  })
  const votes = (): boolean => shown.prompt?.mode === 'vote'
  listenBallotKeys(doc, votes, network)
  listenBallotButtons(touchBallots, votes, network)
}

/**
 * O SIM e o NÃO na camada de toque, montados aqui: fora do `data-touch`, nem
 * a superfície que mira nem o roteador dos botões os veem. Sem a camada (um
 * teste, um canvas solto), ficam num nó solto que ninguém vê.
 */
function mountTouchBallots(doc: Document): HTMLElement {
  const box = doc.createElement('div')
  box.className = 'touch-kick-vote'
  box.hidden = true
  for (const [ballot, label] of [
    ['yes', 'SIM'],
    ['no', 'NÃO'],
  ] as const) {
    const button = doc.createElement('button')
    button.type = 'button'
    button.dataset.kickBallot = ballot
    button.textContent = label
    box.append(button)
  }
  doc.querySelector('#touch-controls')?.append(box)
  return box
}

/** Na captura: o F1 tem que ser barrado antes de o navegador abrir a ajuda. */
function listenBallotKeys(
  doc: Document,
  votes: () => boolean,
  network: Pick<NetworkPort, 'castKickBallot'>,
): void {
  doc.addEventListener(
    'keydown',
    (event) => {
      if (!votes() || event.target instanceof HTMLInputElement) return
      const yes = kickBallotForKey(event.code)
      if (yes === undefined) return
      event.preventDefault()
      network.castKickBallot(yes)
    },
    { capture: true },
  )
}

/** O SIM e o NÃO do toque: o dedo não chega à superfície que mira. */
function listenBallotButtons(
  box: HTMLElement,
  votes: () => boolean,
  network: Pick<NetworkPort, 'castKickBallot'>,
): void {
  for (const button of box.querySelectorAll<HTMLElement>('[data-kick-ballot]')) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (votes()) network.castKickBallot(button.dataset.kickBallot === 'yes')
    })
  }
}
