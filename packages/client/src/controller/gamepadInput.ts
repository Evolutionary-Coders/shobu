import { type HeldButtons, holdButton, type WeaponAction } from './heldButtons.ts'
import type { HeldKeys, MovementAction } from './heldKeys.ts'
import { type HeldStick, stickFromAxes } from './heldStick.ts'

/**
 * O pedaço de `Gamepad` que este módulo usa. Estrutural: o teste roda em node,
 * e um gamepad de mentira é um objeto com dois arrays.
 */
export interface GamepadSnapshot {
  readonly axes: readonly number[]
  readonly buttons: readonly { readonly pressed: boolean }[]
}

/**
 * O contrato com o controle do projeto, nos índices do mapping "standard" que
 * o chrome android entrega (`hardware/controle-vr/README.md`, "Contrato"). Mudar
 * um número aqui sem mudar no firmware deixa um botão mudo.
 *
 * Tiro e luneta respondem também em R2 e L2 (7 e 6): é onde eles ficam num
 * controle de xbox ou playstation, e é com um desses que se testa no desktop.
 */
const MOVEMENT_BUTTONS: Readonly<Record<MovementAction, readonly number[]>> = {
  forward: [],
  back: [],
  left: [],
  right: [],
  jump: [0],
  crouch: [1],
  reload: [2],
  sprint: [10],
}

const WEAPON_BUTTONS: Readonly<Record<WeaponAction, readonly number[]>> = {
  scope: [4, 6],
  fire: [5, 7],
}

/** O botão de trás da cabeça do controle (START). O que ele faz é da visão de capacete. */
export const HEAD_BUTTON = 9

/** Para onde a leitura escreve: os mesmos estados que teclado e mouse preenchem. */
export interface GamepadTargets {
  readonly keys: HeldKeys
  readonly buttons: HeldButtons
  readonly stick: HeldStick
  /**
   * O analógico direito (eixos 2 e 3), que olha. O controle do projeto tem um
   * analógico só e não o usa; num controle de xbox ou playstation, é a mira.
   */
  readonly look: HeldStick
}

export interface GamepadReader {
  /**
   * Lê um quadro do gamepad (ou a falta dele) e escreve nos alvos. Devolve se o
   * botão da cabeça desceu **neste** quadro.
   *
   * Desarmado (`armed` falso: o jogador está no menu), não escreve nada e
   * marca o que está apertado como já visto. O A que confirma o menu fica
   * preso na entrada da partida, e sem isto ele virava pulo: só o próximo
   * aperto, depois de soltar, vale.
   */
  read(pad: GamepadSnapshot | undefined, into: GamepadTargets, armed?: boolean): boolean
}

/**
 * A ponte entre a gamepad api, que só se lê por quadro, e os estados de tecla e
 * botão, que o núcleo lê por tick.
 *
 * Escreve **só na borda**: uma ação muda quando o gamepad muda, e não a cada
 * quadro. Assim o teclado continua valendo com o gamepad conectado — reescrever
 * `jump = false` todo quadro apagaria o espaço que o teclado acabou de prender.
 *
 * O gamepad que some (desligou, bateria, saiu do alcance) solta tudo o que ele
 * segurava, e só isso: personagem que continua correndo sozinho porque o
 * controle caiu é o defeito que se vê primeiro.
 *
 * ```ts
 * const reader = createGamepadReader()
 * const pressedHead = reader.read(navigator.getGamepads()[0] ?? undefined, { keys, buttons, stick })
 * ```
 */
export function createGamepadReader(): GamepadReader {
  const held = new Set<MovementAction | WeaponAction>()
  let headDown = false
  return {
    read: (pad, into, armed = true) => {
      if (!pad) {
        releaseHeld(held, into)
        headDown = false
        return false
      }
      if (armed) syncActions(held, pad, into)
      else absorbPressed(held, pad, into)
      const head = isPressed(pad, HEAD_BUTTON)
      const pressedNow = head && !headDown
      headDown = head
      return pressedNow
    },
  }
}

function syncActions(
  held: Set<MovementAction | WeaponAction>,
  pad: GamepadSnapshot,
  into: GamepadTargets,
): void {
  for (const action of keysOf(MOVEMENT_BUTTONS)) {
    syncKey(held, into.keys, action, anyPressed(pad, MOVEMENT_BUTTONS[action]))
  }
  for (const action of keysOf(WEAPON_BUTTONS)) {
    syncWeapon(held, into.buttons, action, anyPressed(pad, WEAPON_BUTTONS[action]))
  }
  stickFromAxes(pad.axes[0] ?? 0, pad.axes[1] ?? 0, into.stick)
  stickFromAxes(pad.axes[2] ?? 0, pad.axes[3] ?? 0, into.look)
}

function absorbPressed(
  held: Set<MovementAction | WeaponAction>,
  pad: GamepadSnapshot,
  into: GamepadTargets,
): void {
  releaseHeld(held, into)
  for (const action of keysOf(MOVEMENT_BUTTONS)) {
    if (anyPressed(pad, MOVEMENT_BUTTONS[action])) held.add(action)
  }
  for (const action of keysOf(WEAPON_BUTTONS)) {
    if (anyPressed(pad, WEAPON_BUTTONS[action])) held.add(action)
  }
}

function syncKey(
  held: Set<MovementAction | WeaponAction>,
  keys: HeldKeys,
  action: MovementAction,
  pressed: boolean,
): void {
  if (pressed === held.has(action)) return
  keys[action] = pressed
  toggle(held, action, pressed)
}

function syncWeapon(
  held: Set<MovementAction | WeaponAction>,
  buttons: HeldButtons,
  action: WeaponAction,
  pressed: boolean,
): void {
  if (pressed === held.has(action)) return
  holdButton(buttons, action, pressed)
  toggle(held, action, pressed)
}

function releaseHeld(held: Set<MovementAction | WeaponAction>, into: GamepadTargets): void {
  for (const action of held) {
    if (isWeaponAction(action)) into.buttons[action] = false
    else into.keys[action] = false
  }
  held.clear()
  for (const stick of [into.stick, into.look]) {
    stick.ahead = 0
    stick.side = 0
  }
}

function toggle<T>(set: Set<T>, value: T, present: boolean): void {
  if (present) set.add(value)
  else set.delete(value)
}

function isWeaponAction(action: MovementAction | WeaponAction): action is WeaponAction {
  return action === 'fire' || action === 'scope'
}

function anyPressed(pad: GamepadSnapshot, indices: readonly number[]): boolean {
  return indices.some((index) => isPressed(pad, index))
}

function isPressed(pad: GamepadSnapshot, index: number): boolean {
  return pad.buttons[index]?.pressed ?? false
}

function keysOf<T extends string>(record: Readonly<Record<T, unknown>>): T[] {
  return Object.keys(record) as T[]
}
