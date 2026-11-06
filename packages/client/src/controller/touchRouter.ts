import { type HeldStick, stickFromAxes } from './heldStick.ts'
import { isInStickZone, type TouchPoint, type TouchStickLayout } from './touchStickLayout.ts'

export type { TouchPoint } from './touchStickLayout.ts'

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

/** Empurrado além disto, o analógico corre — o polegar não tem um L3 para clicar. */
export const TOUCH_SPRINT_PUSH = 0.92

export interface TouchRouter {
  /**
   * Um dedo encostou. A zona do analógico (`touchStickLayout.ts`) decide o
   * papel dele até ele sair: dentro anda, fora mira.
   */
  down(pointerId: number, at: TouchPoint, layout: TouchStickLayout): TouchRole
  move(pointerId: number, at: TouchPoint): void
  up(pointerId: number): void
  /** Solta tudo: a partida acabou ou o jogador pausou com o dedo na tela. */
  reset(): void
  /** A base do analógico com polegar nele, para desenhar o pino; `undefined` sem dedo. */
  stickOrigin(): TouchPoint | undefined
  /** O analógico agora, escrito em `into`. */
  readStick(into: HeldStick): HeldStick
  /**
   * Escreve o andar do quadro — analógico e corrida — **só enquanto há
   * polegar** no analógico, e zera uma vez quando o polegar sai. Com um
   * controle conectado no mesmo celular, os dois escrevem no mesmo analógico,
   * e o toque parado não pode zerar todo quadro o que o controle acabou de
   * escrever.
   */
  writeMove(stick: HeldStick, keys: { sprint: boolean }): void
  /** O arrasto de mira acumulado desde a última leitura, em px. Ler zera. */
  takeLook(into: { x: number; y: number }): { x: number; y: number }
}

interface Finger {
  readonly pointerId: number
  readonly origin: TouchPoint
  /** O curso do analógico; na mira, não é lido. */
  readonly radius: number
  last: TouchPoint
}

/**
 * ```ts
 * const router = createTouchRouter()
 * const layout = stickLayoutFromRects(ringRect, zoneRect) // base { x: 92, y: 302 }, raio 64
 * router.down(1, { x: 100, y: 300 }, layout) // 'move'
 * router.move(1, { x: 92, y: 238 })
 * router.readStick(stick) // { ahead: 1, side: 0 }
 * ```
 */
export function createTouchRouter(): TouchRouter {
  const fingers: Fingers = {
    mover: undefined,
    looker: undefined,
    look: { x: 0, y: 0 },
    wasMoving: false,
  }
  return {
    down: (pointerId, at, layout) => claimFinger(fingers, pointerId, at, layout),
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
    writeMove: (stick, keys) => writeMove(fingers, stick, keys),
    takeLook: (into) => takeLook(fingers, into),
  }
}

interface Fingers {
  mover: Finger | undefined
  looker: Finger | undefined
  readonly look: { x: number; y: number }
  wasMoving: boolean
}

function writeMove(fingers: Fingers, stick: HeldStick, keys: { sprint: boolean }): void {
  const moving = fingers.mover !== undefined
  const released = fingers.wasMoving && !moving
  fingers.wasMoving = moving
  if (!moving && !released) return
  readStick(fingers.mover, stick)
  keys.sprint = isSprintPush(stick)
}

/**
 * A zona decide o papel; o papel já ocupado recusa o segundo dedo. O polegar
 * que anda parte da base fixa, e não de onde encostou: pousar fora do centro
 * já é um empurrão, como no anel de um analógico de verdade — e é isso que
 * deixa o polegar perto da moldura chegar ao fim do curso para fora.
 */
function claimFinger(
  fingers: Fingers,
  pointerId: number,
  at: TouchPoint,
  layout: TouchStickLayout,
): TouchRole {
  const role = isInStickZone(at, layout) ? 'move' : 'look'
  if (role === 'move' && fingers.mover) return 'none'
  if (role === 'look' && fingers.looker) return 'none'
  const origin = role === 'move' ? layout.base : at
  const finger = { pointerId, origin, radius: layout.radius, last: at }
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
  if (!mover) return stickFromAxes(0, 0, into)
  const dx = mover.last.x - mover.origin.x
  const dy = mover.last.y - mover.origin.y
  return stickFromAxes(dx / mover.radius, dy / mover.radius, into)
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
