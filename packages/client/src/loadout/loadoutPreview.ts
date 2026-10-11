import { characterSkinAt } from './characterSkins.ts'
import { CLASS_LOADOUT_SPEC, type ClassLoadout, classKitOf } from './classLoadout.ts'
import {
  finishAt,
  finishThumbnailUrl,
  KATANA_FINISHES,
  KNIFE_FINISHES,
  SNIPER_FINISHES,
  type WeaponFinish,
} from './weaponFinishes.ts'

/** O que o quadro da EDITAR CLASSE mostra: a miniatura, quando há, e a legenda. */
export interface LoadoutPreview {
  readonly thumbnailUrl: string | undefined
  readonly caption: string
}

/**
 * A miniatura da arma da linha em foco, no acabamento escolhido: a sniper nas
 * linhas dela, cada lâmina na linha dela, e a lâmina da classe na linha do
 * corpo a corpo. A skin de personagem não tem miniatura ainda — a frente dos
 * personagens traz o catálogo —, e mostra só o nome.
 *
 * ```ts
 * loadoutPreviewOf(loadout, 3).caption // 'KATANA · AÇO NEON'
 * ```
 */
export function loadoutPreviewOf(loadout: ClassLoadout, rowIndex: number): LoadoutPreview {
  const key = CLASS_LOADOUT_SPEC[rowIndex]?.key
  if (key === 'characterSkin') {
    return { thumbnailUrl: undefined, caption: characterSkinAt(loadout.characterSkin).label }
  }
  if (key === 'katanaFinish')
    return weaponPreview('KATANA', finishAt(KATANA_FINISHES, loadout.katanaFinish))
  if (key === 'knifeFinish')
    return weaponPreview('FACA', finishAt(KNIFE_FINISHES, loadout.knifeFinish))
  if (key === 'melee') return bladeOfClass(loadout)
  return weaponPreview('SNIPER', finishAt(SNIPER_FINISHES, loadout.sniperFinish))
}

function bladeOfClass(loadout: ClassLoadout): LoadoutPreview {
  const kit = classKitOf(loadout)
  return weaponPreview(kit.meleeWeapon === 'katana' ? 'KATANA' : 'FACA', kit.bladeFinish)
}

function weaponPreview(weapon: string, finish: WeaponFinish): LoadoutPreview {
  return { thumbnailUrl: finishThumbnailUrl(finish), caption: `${weapon} · ${finish.label}` }
}
