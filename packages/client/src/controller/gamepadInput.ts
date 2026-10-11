import { type HeldButtons, holdButton, type WeaponAction } from './heldButtons.ts'
import type { HeldKeys, MovementAction } from './heldKeys.ts'
import { type HeldStick, stickFromAxes } from './heldStick.ts'

/**
 * O pedaço de `Gamepad` que este módulo usa. Estrutural: o teste roda em node,
 * e um gamepad de mentira é um objeto com dois arrays.
 */
export interface GamepadSnapshot {
  readonly axes: readonly number[]
  readonly buttons: readonly { readonly pressed: boolean; readonly value?: number }[]
}

/**
 * L2 e R2 são gatilhos analógicos, e o chrome marca `pressed` a partir de ~12%
 * do curso: encostar o dedo disparava o sniper (revisão do PR #17). Neles o
 * aperto é meio curso.
 */
const TRIGGER_BUTTONS: ReadonlySet<number> = new Set([6, 7])
export const TRIGGER_PRESS_VALUE = 0.5

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
  // Y no xbox, triângulo no playstation: o botão de cima, sob o polegar que
  // já está no A do pulo. O controle do projeto ainda não tem botão de gancho.
  grapple: [3],
  sprint: [10],
}

const WEAPON_BUTTONS: Readonly<Record<WeaponAction, readonly number[]>> = {
  scope: [4, 6],
  fire: [5, 7],
}

/** As ações em ordem fixa: listadas uma vez, e não por `Object.keys` a cada quadro. */
const MOVEMENT_ACTIONS = Object.keys(MOVEMENT_BUTTONS) as MovementAction[]
const WEAPON_ACTIONS = Object.keys(WEAPON_BUTTONS) as WeaponAction[]

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
   * botão da cabeça está preso — toque curto e segurar são gestos diferentes,
   * e quem os separa é `startGesture.ts`.
   *
   * Desarmado (`armed` falso: o jogador está no menu), não escreve nada e
   * marca o que está apertado como já visto. O A que confirma o menu fica
   * preso na entrada da partida, e sem isto ele virava pulo: só o próximo
   * aperto, depois de soltar, vale. A absorção vale também no **quadro em que
   * arma**: o menu lê o controle num laço próprio, e o A que ele viu descer
   * pode chegar aqui pela primeira vez já com o jogo armado.
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
  // nasce armado: só a passagem do menu para o jogo absorve, não a primeira leitura.
  let wasArmed = true
  return {
    read: (pad, into, armed = true) => {
      const arming = armed && !wasArmed
      wasArmed = armed
      if (!pad) {
        releaseHeld(held, into)
        return false
      }
      if (armed && !arming) syncActions(held, pad, into)
      else absorbPressed(held, pad, into)
      return isPressed(pad, HEAD_BUTTON)
    },
  }
}

function syncActions(
  held: Set<MovementAction | WeaponAction>,
  pad: GamepadSnapshot,
  into: GamepadTargets,
): void {
  for (const action of MOVEMENT_ACTIONS) {
    syncKey(held, into.keys, action, anyPressed(pad, MOVEMENT_BUTTONS[action]))
  }
  for (const action of WEAPON_ACTIONS) {
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
  for (const action of MOVEMENT_ACTIONS) {
    if (anyPressed(pad, MOVEMENT_BUTTONS[action])) held.add(action)
  }
  for (const action of WEAPON_ACTIONS) {
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
  into.stick.ahead = 0
  into.stick.side = 0
  into.look.ahead = 0
  into.look.side = 0
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
  const button = pad.buttons[index]
  if (!TRIGGER_BUTTONS.has(index) || button?.value === undefined) return button?.pressed ?? false
  return button.value >= TRIGGER_PRESS_VALUE
}
