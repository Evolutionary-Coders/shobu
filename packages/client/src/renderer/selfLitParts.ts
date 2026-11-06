/**
 * As peças de viewmodel que trazem a própria luz no glb: o neon da sniper
 * laser (`laser_*`) e as placas cibernéticas dos braços (`arms_cyber_plates`).
 * A cor delas está na textura emissiva, e o acabamento da classe
 * (`paintSniper`) não pode tingi-las nem apagar a emissão — era o que fazia o
 * neon sumir na primeira pintura (auditoria dos modelos, 29/10). O que ele pode
 * é trocar a paleta inteira do neon da HANABI (`sniperSkinSlot`).
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
 * O material do corpo das duas snipers (`sniper`), já achatado
 * (`viewmodel-sniper`). Pelo material e não pela malha: o babylon dá à malha o
 * nome do **nó**, e o nó dos braços é `Object_80` — o teste por
 * `mesh.name.includes('arms')` nunca acertava, e o acabamento tingia os braços
 * (revisão da integração da laser, 29/10). Por material, os braços, a lente e
 * o retículo ficam de fora sem lista nenhuma.
 */
const BODY_MATERIAL = '-sniper'

/** O material do neon da HANABI, a paleta que `sniper_laser.py` pinta. */
const PALETTE_MATERIAL = '-sniper_laser_palette'

/** Onde o acabamento da sniper põe a textura de uma malha (`paintSniper`). */
export type SniperSkinSlot = 'body' | 'palette' | 'skip'

/**
 * Qual textura do acabamento vai na malha: o atlas do corpo, a paleta do neon
 * da HANABI, ou nenhuma. `materialName` é o do material já achatado, que
 * começa no prefixo do loader. O neon (`keepsOwnGlow`) só troca de paleta:
 * nunca recebe o atlas do corpo, que apagaria a emissão dele.
 *
 * ```ts
 * sniperSkinSlot('base_sniper_0', 'viewmodel-sniper') // 'body'
 * sniperSkinSlot('laser_emitter', 'viewmodel-sniper_laser_palette') // 'palette'
 * sniperSkinSlot('Object_80', 'viewmodel-arms') // 'skip'
 * ```
 */
export function sniperSkinSlot(meshName: string, materialName: string): SniperSkinSlot {
  if (materialName.endsWith(PALETTE_MATERIAL)) return 'palette'
  if (materialName.endsWith(BODY_MATERIAL) && !keepsOwnGlow(meshName)) return 'body'
  return 'skip'
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
