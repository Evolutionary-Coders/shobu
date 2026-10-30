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

/**
 * O material da pele dos braços, como o glb o nomeia (`arms`). Pelo material e
 * não pela malha: o babylon dá à malha o nome do **nó**, e o nó dos braços é
 * `Object_80` — o teste por `mesh.name.includes('arms')` nunca acertava, e o
 * acabamento tingia os braços (revisão da integração da laser, 29/10).
 */
const ARMS_MATERIAL = 'arms'

/**
 * Verdadeiro para a malha que o acabamento da sniper não pinta: os braços e o
 * que tem luz própria (`keepsOwnGlow`). `materialName` é o do material já
 * achatado (`viewmodel-arms`), que termina no nome do glb.
 *
 * ```ts
 * skipsFinish('Object_80', 'viewmodel-arms') // true
 * skipsFinish('base_sniper_0', 'viewmodel-sniper') // false
 * ```
 */
export function skipsFinish(meshName: string, materialName: string): boolean {
  return materialName.endsWith(ARMS_MATERIAL) || keepsOwnGlow(meshName)
}

/**
 * O fio da lâmina e o filete da luva: as duas peças que acendem, pelo nome do
 * material (`melee_blades.py`). A cor delas é a do acabamento (`paintBlade`).
 *
 * ```ts
 * isBladeGlow('blade-M_Fio') // true
 * isBladeGlow('blade-M_Lamina') // false
 * ```
 */
export function isBladeGlow(materialName: string): boolean {
  return materialName.endsWith('M_Fio') || materialName.endsWith('M_Filete')
}
