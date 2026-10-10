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

/** Os pares em ordem fixa: listados uma vez, e não por `Object.entries` a cada quadro. */
const BUTTON_COMMANDS = Object.entries(COMMAND_BY_BUTTON).map(
  ([index, command]) => [Number(index), command] as const,
)

/** Quanto o analógico precisa inclinar para virar seta: mais que meio curso. */
export const MENU_STICK_THRESHOLD = 0.5

/** Segurar a direção repete, como a tecla presa: espera isto, e depois repete a cada… */
export const MENU_REPEAT_DELAY_MS = 400
export const MENU_REPEAT_EVERY_MS = 110

export interface GamepadMenuReader {
  /**
   * Os comandos deste quadro: borda de aperto, e repetição para as direções
   * presas. Vetor reaproveitado: vale até a próxima leitura.
   */
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
  // reaproveitados: o leitor roda todo quadro, também durante a partida.
  const pressed = new Set<MenuCommand>()
  const fired: MenuCommand[] = []
  return {
    read: (pad, nowMs) => {
      collectPressed(pad, pressed)
      forgetReleased(held, pressed)
      fired.length = 0
      for (const command of pressed) if (shouldFire(held, command, nowMs)) fired.push(command)
      return fired
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

function collectPressed(pad: GamepadSnapshot | undefined, into: Set<MenuCommand>): void {
  into.clear()
  if (!pad) return
  for (const [index, command] of BUTTON_COMMANDS) {
    if (pad.buttons[index]?.pressed) into.add(command)
  }
  addStickCommands(pad.axes[0] ?? 0, pad.axes[1] ?? 0, into)
}

function addStickCommands(x: number, y: number, into: Set<MenuCommand>): void {
  if (y <= -MENU_STICK_THRESHOLD) into.add('up')
  if (y >= MENU_STICK_THRESHOLD) into.add('down')
  if (x <= -MENU_STICK_THRESHOLD) into.add('left')
  if (x >= MENU_STICK_THRESHOLD) into.add('right')
}
