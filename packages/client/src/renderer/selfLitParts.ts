/**
 * As peças de viewmodel que trazem a própria luz no glb: o neon da sniper
 * laser (`laser_*`) e as placas cibernéticas dos braços (`arms_cyber_plates`).
 * A cor delas está na textura emissiva, e o acabamento da classe
 * (`paintSniper`) não pode tingi-las nem apagar a emissão — era o que fazia o
 * neon sumir na primeira pintura (auditoria dos modelos, 29/10).
 */

/** O prefixo dos nós de neon da sniper laser, como o blender os exporta. */
const LASER_PART_PREFIX = 'laser_'

/** A malha com esqueleto das placas dos braços, em todos os viewmodels. */
const CYBER_PLATES = 'arms_cyber_plates'

/**
 * Verdadeiro para a malha que acende sozinha e fica fora do acabamento. Por
 * prefixo e não por igualdade: o glTF parte malha de vários materiais em
 * `<nó>_primitive0`, `<nó>_primitive1`.
 *
 * ```ts
 * keepsOwnGlow('laser_emitter_primitive0') // true
 * keepsOwnGlow('base_sniper_0') // false
 * ```
 */
export function keepsOwnGlow(meshName: string): boolean {
  return meshName.startsWith(LASER_PART_PREFIX) || meshName.includes(CYBER_PLATES)
}
