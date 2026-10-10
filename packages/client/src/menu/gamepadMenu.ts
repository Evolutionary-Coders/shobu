import type { GamepadSnapshot } from '../controller/gamepadInput.ts'
import type { MenuCommand } from './mainMenuModel.ts'
import { acceptsRepeat } from './menuCommandForKey.ts'

/**
 * O menu pelo controle, no molde do `menuCommandForKey.ts`: A confirma, B
 * volta, o direcional e o analógico esquerdo andam. Com o mapping "standard",
 * vale igual para xbox, playstation e o controle do projeto.
 */
const COMMAND_BY_BUTTON: Readonly<Record<number, MenuCommand>> = {
  0: 'activate',
  1: 'back',
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
}

/** Quanto o analógico precisa inclinar para virar seta: mais que meio curso. */
export const MENU_STICK_THRESHOLD = 0.5

/** Segurar a direção repete, como a tecla presa: espera isto, e depois repete a cada… */
export const MENU_REPEAT_DELAY_MS = 400
export const MENU_REPEAT_EVERY_MS = 110

export interface GamepadMenuReader {
  /** Os comandos deste quadro: borda de aperto, e repetição para as direções presas. */
  read(pad: GamepadSnapshot | undefined, nowMs: number): readonly MenuCommand[]
}

interface HeldCommand {
  readonly sinceMs: number
  lastMs: number
}

/**
 * ```ts
 * const reader = createGamepadMenuReader()
 * for (const command of reader.read(navigator.getGamepads()[0] ?? undefined, performance.now())) menu.emit(command)
 * ```
 */
export function createGamepadMenuReader(): GamepadMenuReader {
  const held = new Map<MenuCommand, HeldCommand>()
  return {
    read: (pad, nowMs) => {
      const pressed = pad ? pressedCommands(pad) : new Set<MenuCommand>()
      forgetReleased(held, pressed)
      return [...pressed].filter((command) => shouldFire(held, command, nowMs))
    },
  }
}

function forgetReleased(held: Map<MenuCommand, HeldCommand>, pressed: Set<MenuCommand>): void {
  for (const command of held.keys()) {
    if (!pressed.has(command)) held.delete(command)
  }
}

function shouldFire(
  held: Map<MenuCommand, HeldCommand>,
  command: MenuCommand,
  nowMs: number,
): boolean {
  const state = held.get(command)
  if (!state) {
    held.set(command, { sinceMs: nowMs, lastMs: nowMs })
    return true
  }
  if (!acceptsRepeat(command)) return false
  const repeating = nowMs - state.sinceMs >= MENU_REPEAT_DELAY_MS
  if (!repeating || nowMs - state.lastMs < MENU_REPEAT_EVERY_MS) return false
  state.lastMs = nowMs
  return true
}

function pressedCommands(pad: GamepadSnapshot): Set<MenuCommand> {
  const pressed = new Set<MenuCommand>()
  for (const [index, command] of Object.entries(COMMAND_BY_BUTTON)) {
    if (pad.buttons[Number(index)]?.pressed) pressed.add(command)
  }
  for (const command of stickCommands(pad.axes[0] ?? 0, pad.axes[1] ?? 0)) pressed.add(command)
  return pressed
}

function stickCommands(x: number, y: number): MenuCommand[] {
  const commands: MenuCommand[] = []
  if (y <= -MENU_STICK_THRESHOLD) commands.push('up')
  if (y >= MENU_STICK_THRESHOLD) commands.push('down')
  if (x <= -MENU_STICK_THRESHOLD) commands.push('left')
  if (x >= MENU_STICK_THRESHOLD) commands.push('right')
  return commands
}
