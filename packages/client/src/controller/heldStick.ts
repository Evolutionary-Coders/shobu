/**
 * O analógico como estado, no mesmo desenho do `heldKeys.ts`: o núcleo roda em
 * tick fixo e pergunta "para onde o jogador quer ir agora?", e quem lê o
 * gamepad escreve aqui uma vez por quadro.
 *
 * `ahead` é para a frente da câmera e `side` para a direita, os dois em
 * [-1, 1]. Meio curso é meia velocidade: o analógico anda devagar, o teclado não.
 */
export interface HeldStick {
  ahead: number
  side: number
}

/**
 * Abaixo disto o analógico está parado. O firmware do controle já tem zona
 * morta própria, mas um controle de xbox gasto deriva uns 8% sozinho, e o
 * personagem que anda sem ninguém tocar é o primeiro defeito que alguém nota.
 */
export const STICK_DEAD_ZONE = 0.12

export function createHeldStick(): HeldStick {
  return { ahead: 0, side: 0 }
}

/**
 * Dos eixos do gamepad para o estado. Zona morta **radial** e reescalada: a
 * diagonal não morre antes dos eixos, e sair da zona começa em zero, não em 12%.
 *
 * O eixo y do gamepad "standard" cresce para baixo, então empurrar para a
 * frente é y negativo.
 *
 * ```ts
 * stickFromAxes(0, -1, stick) // { ahead: 1, side: 0 }
 * stickFromAxes(0.05, 0, stick) // { ahead: 0, side: 0 }: dentro da zona morta
 * ```
 */
export function stickFromAxes(axisX: number, axisY: number, into: HeldStick): HeldStick {
  const length = Math.hypot(axisX, axisY)
  if (length <= STICK_DEAD_ZONE) return release(into)
  const scaled = Math.min(1, (length - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)) / length
  into.ahead = -axisY * scaled
  into.side = axisX * scaled
  return into
}

function release(into: HeldStick): HeldStick {
  into.ahead = 0
  into.side = 0
  return into
}
