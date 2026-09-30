import type { Vector3 } from '../math/vector3.ts'
import type { CharacterState } from './characterState.ts'

/**
 * Onde o olho fica na cápsula: 92 % da altura, como em gente de verdade. No
 * topo (100 %) o jogador olhava de cima para o avatar de 1,8 m e o achava
 * baixo — o olho de um corpo de 1,8 m está a uns 1,66 m, não a 1,8.
 */
export const EYE_HEIGHT_RATIO = 0.92

/**
 * O olho de um tick, de onde o tiro sai. Cliente e servidor usam o mesmo: o
 * servidor não tem o olho interpolado da câmera, e um tiro que sai de pontos
 * diferentes nos dois lados pode acertar num e errar no outro.
 *
 * ```ts
 * eyeOf(character.current, shotOrigin)
 * ```
 */
export function eyeOf(state: Readonly<CharacterState>, out: Vector3): Vector3 {
  out.x = state.position.x
  out.y = state.position.y + state.capsuleHeightM * EYE_HEIGHT_RATIO
  out.z = state.position.z
  return out
}
