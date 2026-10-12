import type { MenuCommand } from '../menu/mainMenuModel.ts'
import { castVote, type MapVoteBooth, moveVoteFocus } from './mapVoteBooth.ts'

/**
 * O que o jogador pode fazer na tela de MVP, venha de onde vier: andar o
 * foco, votar numa opção, votar na opção em foco, ou voltar ao menu. O
 * teclado, o mouse, o controle e o toque viram estes comandos no adapter
 * (`matchEndInput.ts`), e só eles mexem na cabine.
 */
export type VoteCommand =
  | { readonly kind: 'focus'; readonly step: number }
  | { readonly kind: 'vote'; readonly index: number }
  | { readonly kind: 'vote-focused' }
  | { readonly kind: 'leave' }

const KEY_COMMANDS: Readonly<Record<string, VoteCommand>> = {
  ArrowLeft: { kind: 'focus', step: -1 },
  ArrowUp: { kind: 'focus', step: -1 },
  KeyA: { kind: 'focus', step: -1 },
  KeyW: { kind: 'focus', step: -1 },
  ArrowRight: { kind: 'focus', step: 1 },
  ArrowDown: { kind: 'focus', step: 1 },
  KeyD: { kind: 'focus', step: 1 },
  KeyS: { kind: 'focus', step: 1 },
  Enter: { kind: 'vote-focused' },
  NumpadEnter: { kind: 'vote-focused' },
  Space: { kind: 'vote-focused' },
  // com o ponteiro travado o navegador fica com o Esc; sem ele (controle,
  // toque), o Esc do teclado chega aqui.
  Escape: { kind: 'leave' },
  Backspace: { kind: 'leave' },
}

/**
 * A tecla, pelo `code` do evento: os números votam direto (1 é a primeira
 * opção), as setas e o WASD andam o foco, Enter e espaço votam no foco.
 *
 * ```ts
 * voteCommandForKey('Digit2') // { kind: 'vote', index: 1 }
 * ```
 */
export function voteCommandForKey(code: string): VoteCommand | undefined {
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code)
  if (digit) return { kind: 'vote', index: Number(digit[1]) - 1 }
  return KEY_COMMANDS[code]
}

const MENU_COMMANDS: Readonly<Record<MenuCommand, VoteCommand>> = {
  up: { kind: 'focus', step: -1 },
  left: { kind: 'focus', step: -1 },
  down: { kind: 'focus', step: 1 },
  right: { kind: 'focus', step: 1 },
  activate: { kind: 'vote-focused' },
  back: { kind: 'leave' },
}

/**
 * O controle, pelos comandos do leitor do menu (`gamepadMenu.ts`): o d-pad e
 * o analógico andam o foco, o A vota, o B volta ao menu.
 */
export function voteCommandForMenu(command: MenuCommand): VoteCommand {
  return MENU_COMMANDS[command]
}

/** Quanto o mouse anda, com o ponteiro travado, para o foco passar à opção vizinha. */
export const MOUSE_FOCUS_STEP_PX = 140

/**
 * O mouse travado não tem cursor: o deslocamento lateral acumula, e cada
 * `MOUSE_FOCUS_STEP_PX` anda o foco uma opção. Devolve os passos e o que
 * sobrou para o próximo movimento.
 *
 * ```ts
 * mouseFocusSteps(100, 60) // { steps: 1, remainderPx: 20 }
 * ```
 */
export function mouseFocusSteps(
  accumulatedPx: number,
  movementXPx: number,
): { steps: number; remainderPx: number } {
  const total = accumulatedPx + movementXPx
  const steps = Math.trunc(total / MOUSE_FOCUS_STEP_PX)
  return { steps, remainderPx: total - steps * MOUSE_FOCUS_STEP_PX }
}

/**
 * Aplica o comando à cabine; devolve `true` quando o jogador pediu para
 * voltar ao menu — quem sai da arena é o adapter.
 *
 * ```ts
 * if (applyVoteCommand(booth, command, 'local', flow.phaseS)) leaveArena()
 * ```
 */
export function applyVoteCommand(
  booth: MapVoteBooth,
  command: VoteCommand,
  voterId: string,
  atS: number,
): boolean {
  if (command.kind === 'leave') return true
  if (command.kind === 'focus') moveVoteFocus(booth, command.step)
  if (command.kind === 'vote') castVote(booth, voterId, command.index, atS)
  if (command.kind === 'vote-focused') castVote(booth, voterId, booth.focus, atS)
  return false
}
