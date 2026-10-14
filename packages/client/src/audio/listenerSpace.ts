import type { Vector3 } from '@shobu/core'

/**
 * Do mundo do jogo para o espaço da Web Audio. O babylon é de **mão
 * esquerda** (y para cima, z para a frente) e a Web Audio é de **mão
 * direita**, como o OpenGL: trocar o sinal do z é o que mantém a direita do
 * jogador à direita no fone. Sem isto o tiro que vem da esquerda soaria da
 * direita — o pior erro que um som de posição pode cometer.
 *
 * Vale para ponto e para direção, e escreve em `out` porque roda por quadro.
 *
 * ```ts
 * toWebAudioSpace({ x: 1, y: 2, z: 3 }, out) // { x: 1, y: 2, z: -3 }
 * ```
 */
export function toWebAudioSpace(worldM: Readonly<Vector3>, out: Vector3): Vector3 {
  out.x = worldM.x
  out.y = worldM.y
  out.z = -worldM.z
  return out
}
