import type { MeleeWeapon, PrimaryWeapon } from '@shobu/core'
import { type HumanSkinId, playerSkinFor } from '../character/humanSkins.ts'
import { type ClassLoadout, classKitOf } from './classLoadout.ts'

/**
 * O que a cena monta no boot a partir da classe guardada: a skin (os bots se
 * vestem das outras) e os únicos modelos de arma que o boot baixa — a lâmina
 * e a arma principal da classe. Os outros descem quando a classe muda no menu.
 */
export interface BootKit {
  readonly playerSkin: HumanSkinId
  readonly meleeWeapon: MeleeWeapon
  readonly primaryWeapon: PrimaryWeapon
}

/**
 * A classe guardada no que o boot precisa dela.
 *
 * ```ts
 * bootKitOf(parseClassLoadout(null)) // { playerSkin: 'ronin', meleeWeapon: 'katana', primaryWeapon: 'laser' }
 * ```
 */
export function bootKitOf(loadout: ClassLoadout): BootKit {
  const kit = classKitOf(loadout)
  return {
    playerSkin: playerSkinFor(kit.characterSkinId),
    meleeWeapon: kit.meleeWeapon,
    primaryWeapon: kit.primaryWeapon,
  }
}
