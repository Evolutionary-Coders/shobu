import { type HeldStick, stickFromAxes } from './heldStick.ts'

/**
 * O jogo pelo toque, no celular sem óculos: o polegar esquerdo anda, o direito
 * mira. É o desenho de todo fps de celular, e por isso o jogador da feira não
 * precisa de tutorial.
 *
 * Dado puro: quem ouve os `pointerdown` e desenha o analógico é
 * `hud/touchControls.ts`. Os botões (tiro, luneta, pulo...) são elementos
 * próprios e não passam por aqui — isto é só a superfície livre da tela.
 */

/** O que um dedo faz. `none` é o terceiro dedo, que não manda em nada. */
export type TouchRole = 'move' | 'look' | 'none'

/**
 * O raio do analógico virtual, em px css. É o curso inteiro: o polegar a este
 * raio da origem é o analógico no fim. 56 px cabem no polegar de um s23
 * deitado sem o dedo sair da metade esquerda.
 */
export const TOUCH_STICK_RADIUS_PX = 56

/** Empurrado além disto, o analógico corre — o polegar não tem um L3 para clicar. */
export const TOUCH_SPRINT_PUSH = 0.92

export interface TouchPoint {
  readonly x: number
  readonly y: number
}

export interface TouchRouter {
  /** Um dedo encostou. A metade da tela decide o papel dele até ele sair. */
  down(pointerId: number, at: TouchPoint, viewportWidth: number): TouchRole
  move(pointerId: number, at: TouchPoint): void
  up(pointerId: number): void
  /** Solta tudo: a partida acabou ou o jogador pausou com o dedo na tela. */
  reset(): void
  /** Onde o analógico nasceu, para desenhar o anel; `undefined` sem dedo nele. */
  stickOrigin(): TouchPoint | undefined
  /** O analógico agora, escrito em `into`. */
  readStick(into: HeldStick): HeldStick
  /** O arrasto de mira acumulado desde a última leitura, em px. Ler zera. */
  takeLook(into: { x: number; y: number }): { x: number; y: number }
}

interface Finger {
  readonly pointerId: number
  readonly origin: TouchPoint
  last: TouchPoint
}

/**
 * ```ts
 * const router = createTouchRouter()
 * router.down(1, { x: 100, y: 300 }, 844) // 'move'
 * router.move(1, { x: 100, y: 244 })
 * router.readStick(stick) // { ahead: 1, side: 0 }
 * ```
 */
export function createTouchRouter(): TouchRouter {
  const fingers: Fingers = { mover: undefined, looker: undefined, look: { x: 0, y: 0 } }
  return {
    down: (pointerId, at, viewportWidth) => claimFinger(fingers, pointerId, at, viewportWidth),
    move: (pointerId, at) => moveFinger(fingers, pointerId, at),
    up: (pointerId) => {
      if (fingers.mover?.pointerId === pointerId) fingers.mover = undefined
      if (fingers.looker?.pointerId === pointerId) fingers.looker = undefined
    },
    reset: () => {
      fingers.mover = undefined
      fingers.looker = undefined
      takeLook(fingers, { x: 0, y: 0 })
    },
    stickOrigin: () => fingers.mover?.origin,
    readStick: (into) => readStick(fingers.mover, into),
    takeLook: (into) => takeLook(fingers, into),
  }
}

interface Fingers {
  mover: Finger | undefined
  looker: Finger | undefined
  readonly look: { x: number; y: number }
}

/** A metade da tela decide o papel; a metade já ocupada recusa o segundo dedo. */
function claimFinger(
  fingers: Fingers,
  pointerId: number,
  at: TouchPoint,
  viewportWidth: number,
): TouchRole {
  const finger = { pointerId, origin: at, last: at }
  const role = at.x < viewportWidth / 2 ? 'move' : 'look'
  if (role === 'move' && fingers.mover) return 'none'
  if (role === 'look' && fingers.looker) return 'none'
  if (role === 'move') fingers.mover = finger
  else fingers.looker = finger
  return role
}

function moveFinger(fingers: Fingers, pointerId: number, at: TouchPoint): void {
  if (fingers.mover?.pointerId === pointerId) fingers.mover.last = at
  const looker = fingers.looker
  if (looker?.pointerId !== pointerId) return
  fingers.look.x += at.x - looker.last.x
  fingers.look.y += at.y - looker.last.y
  looker.last = at
}

function takeLook(fingers: Fingers, into: { x: number; y: number }): { x: number; y: number } {
  into.x = fingers.look.x
  into.y = fingers.look.y
  fingers.look.x = 0
  fingers.look.y = 0
  return into
}

/** O mesmo `stickFromAxes` do gamepad: zona morta radial e y de tela crescendo para baixo. */
function readStick(mover: Finger | undefined, into: HeldStick): HeldStick {
  const dx = mover ? mover.last.x - mover.origin.x : 0
  const dy = mover ? mover.last.y - mover.origin.y : 0
  return stickFromAxes(dx / TOUCH_STICK_RADIUS_PX, dy / TOUCH_STICK_RADIUS_PX, into)
}

/**
 * Corre quando o polegar vai ao fim do curso **para a frente**: de lado ou de
 * costas o personagem não corre, e correr de ré por esbarrar o dedo seria o
 * analógico decidindo pelo jogador.
 *
 * ```ts
 * isSprintPush({ ahead: 0.97, side: 0.1 }) // true
 * ```
 */
export function isSprintPush(stick: Readonly<HeldStick>): boolean {
  return stick.ahead >= TOUCH_SPRINT_PUSH
}
