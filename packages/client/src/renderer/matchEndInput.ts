import {
  mouseFocusSteps,
  type VoteCommand,
  voteCommandForKey,
  voteCommandForMenu,
} from '../matchEnd/voteCommands.ts'
import { createGamepadMenuReader } from '../menu/gamepadMenu.ts'
import type { MenuCommand } from '../menu/mainMenuModel.ts'

/**
 * O que o jogador faz na tela de MVP, de qualquer entrada, numa fila que o
 * quadro esvazia (`driveMatchEnd.ts`). Adapter de dom e gamepad: o que cada
 * tecla ou botão quer dizer é de `voteCommands.ts`.
 *
 * - **teclado**: 1/2/3 votam direto, setas e WASD andam o foco, Enter e
 *   espaço votam nele;
 * - **mouse travado**: sem cursor, o deslocamento lateral anda o foco e o
 *   clique vota nele;
 * - **mouse solto e toque**: o clique ou o toque na opção vota nela, e no
 *   botão VOLTAR AO MENU, volta;
 * - **controle**: d-pad e analógico andam, A vota, B volta ao menu.
 */
export interface MatchEndInput {
  /** Os comandos desde o último quadro. Esvazia a fila. */
  drain(): readonly VoteCommand[]
  dispose(): void
}

const NO_COMMANDS: readonly VoteCommand[] = []

/**
 * ```ts
 * const input = createMatchEndInput(document, () => screenOpen)
 * for (const command of input.drain()) applyVoteCommand(booth, command, 'local', atS)
 * ```
 */
export function createMatchEndInput(doc: Document, listening: () => boolean): MatchEndInput {
  const queue: VoteCommand[] = []
  const push = (command: VoteCommand | undefined): void => {
    if (command && listening()) queue.push(command)
  }
  const stopListening = listenForVotes(doc, push, listening)
  const gamepad = createGamepadPoller(listening)
  return {
    drain: () => {
      for (const command of gamepad.read()) push(voteCommandForMenu(command))
      // a fila quase sempre vem vazia: devolver a constante não aloca por quadro.
      return queue.length === 0 ? NO_COMMANDS : queue.splice(0, queue.length)
    },
    dispose: stopListening,
  }
}

/** O teclado, o mouse e o toque, ligados ao documento. Devolve quem os desliga. */
function listenForVotes(
  doc: Document,
  push: (command: VoteCommand | undefined) => void,
  listening: () => boolean,
): () => void {
  const mouse = { remainderPx: 0 }
  const onKey = (event: KeyboardEvent): void => {
    const command = listening() ? voteCommandForKey(event.code) : undefined
    if (!command) return
    event.preventDefault()
    push(command)
  }
  const onMove = (event: MouseEvent): void => {
    if (!listening() || !doc.pointerLockElement) return
    const { steps, remainderPx } = mouseFocusSteps(mouse.remainderPx, event.movementX)
    mouse.remainderPx = remainderPx
    if (steps !== 0) push({ kind: 'focus', step: steps })
  }
  const onPointer = (event: PointerEvent): void => push(pointerCommand(doc, event))
  doc.addEventListener('keydown', onKey, true)
  doc.addEventListener('mousemove', onMove)
  doc.addEventListener('pointerdown', onPointer, true)
  return () => {
    doc.removeEventListener('keydown', onKey, true)
    doc.removeEventListener('mousemove', onMove)
    doc.removeEventListener('pointerdown', onPointer, true)
  }
}

/** O clique travado vota no foco; solto, vota na opção tocada, ou sai pelo botão. */
function pointerCommand(doc: Document, event: PointerEvent): VoteCommand | undefined {
  if (doc.pointerLockElement) return event.button === 0 ? { kind: 'vote-focused' } : undefined
  const target = event.target instanceof Element ? event.target : undefined
  if (target?.closest('[data-match-end-leave]')) return { kind: 'leave' }
  const option = target?.closest<HTMLElement>('[data-vote-option]')
  return option ? { kind: 'vote', index: Number(option.dataset.voteOption) } : undefined
}

/**
 * O controle, lido só com a tela aberta: `getGamepads` devolve um vetor novo a
 * cada chamada, e o quadro de jogo não aloca (nfr.md). A primeira leitura de
 * cada abertura é descartada — ela só assenta o que já estava preso, senão o A
 * de quem pulava no último segundo virava voto no quadro em que a tela abre.
 */
function createGamepadPoller(listening: () => boolean): { read(): readonly MenuCommand[] } {
  const reader = createGamepadMenuReader()
  const state = { primed: false }
  return {
    read: () => {
      if (!listening()) {
        state.primed = false
        return NO_MENU_COMMANDS
      }
      const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? undefined
      const commands = reader.read(pad, performance.now())
      if (state.primed) return commands
      state.primed = true
      return NO_MENU_COMMANDS
    },
  }
}

const NO_MENU_COMMANDS: readonly MenuCommand[] = []
