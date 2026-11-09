import type { PrimaryWeapon } from '@shobu/core'
import { characterSkinAt } from './characterSkins.ts'
import { CLASS_LOADOUT_SPEC, type ClassLoadout, classKitOf } from './classLoadout.ts'
import {
  finishAt,
  finishThumbnailUrl,
  KATANA_FINISHES,
  KNIFE_FINISHES,
  primaryThumbnailUrl,
  type WeaponFinish,
} from './weaponFinishes.ts'

/** O que o quadro da EDITAR CLASSE mostra: a miniatura, quando há, e a legenda. */
export interface LoadoutPreview {
  readonly thumbnailUrl: string | undefined
  readonly caption: string
}

/** O nome curto de cada arma principal, na legenda do quadro. */
const PRIMARY_SHORT_NAMES: Readonly<Record<PrimaryWeapon, string>> = {
  laser: 'HANABI',
  classic: 'SNIPER',
}

/**
 * A miniatura da arma da linha em foco, no acabamento escolhido: a arma
 * principal da classe nas linhas dela, cada lâmina na linha dela, e a lâmina da classe na linha do
 * corpo a corpo. A skin de personagem mostra o retrato do humano.
 *
 * ```ts
 * loadoutPreviewOf(loadout, 3).caption // 'KATANA · AÇO NEON'
 * ```
 */
export function loadoutPreviewOf(loadout: ClassLoadout, rowIndex: number): LoadoutPreview {
  const key = CLASS_LOADOUT_SPEC[rowIndex]?.key
  if (key === 'characterSkin') {
    const skin = characterSkinAt(loadout.characterSkin)
    return { thumbnailUrl: skin.thumbnailUrl, caption: skin.label }
  }
  if (key === 'katanaFinish')
    return weaponPreview('KATANA', finishAt(KATANA_FINISHES, loadout.katanaFinish))
  if (key === 'knifeFinish')
    return weaponPreview('FACA', finishAt(KNIFE_FINISHES, loadout.knifeFinish))
  if (key === 'melee') return bladeOfClass(loadout)
  return primaryPreview(loadout)
}

/** A arma principal escolhida, no acabamento da sniper: as duas são snipers e o vestem igual. */
function primaryPreview(loadout: ClassLoadout): LoadoutPreview {
  const { primaryWeapon, sniperFinish } = classKitOf(loadout)
  return {
    thumbnailUrl: primaryThumbnailUrl(primaryWeapon, sniperFinish),
    caption: `${PRIMARY_SHORT_NAMES[primaryWeapon]} · ${sniperFinish.label}`,
  }
}

function bladeOfClass(loadout: ClassLoadout): LoadoutPreview {
  const kit = classKitOf(loadout)
  return weaponPreview(kit.meleeWeapon === 'katana' ? 'KATANA' : 'FACA', kit.bladeFinish)
}

function weaponPreview(weapon: string, finish: WeaponFinish): LoadoutPreview {
  return { thumbnailUrl: finishThumbnailUrl(finish), caption: `${weapon} · ${finish.label}` }
}
