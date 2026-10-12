import { MELEE_WEAPONS, type MeleeWeapon } from '@shobu/core'
import { type ChoiceSpec, type ChoiceValues, parseChoices } from '../menu/choiceTable.ts'
import { createJsonStore, type JsonStore, type SettingsStorage } from '../settings/jsonStore.ts'
import { CHARACTER_SKINS, characterSkinAt } from './characterSkins.ts'
import {
  BLADE_FINISHES,
  finishAt,
  KATANA_FINISHES,
  KNIFE_FINISHES,
  SNIPER_FINISHES,
  type WeaponFinish,
} from './weaponFinishes.ts'

/**
 * A classe do jogador (ADR 0021): a arma principal, o slot de corpo a corpo,
 * o acabamento de cada arma e a skin do personagem. É **preferência**, como as
 * configurações: mora no armazenamento do navegador, e o servidor, quando
 * existir, recebe a escolha na entrada da sala.
 *
 * Um acabamento por lâmina, e não um para "a lâmina da classe": trocar de
 * katana para faca e voltar não pode perder o acabamento escolhido.
 */
export type ClassLoadoutKey =
  | 'primary'
  | 'melee'
  | 'sniperFinish'
  | 'katanaFinish'
  | 'knifeFinish'
  | 'characterSkin'

export type ClassLoadout = ChoiceValues<ClassLoadoutKey>

/**
 * As armas principais. Hoje só a sniper: a linha existe para a estrutura estar
 * pronta para a segunda arma, e a seta nela não anda.
 */
export const PRIMARY_WEAPONS = [{ id: 'sniper', label: 'SNIPER SHB-96' }] as const

const MELEE_LABELS: Readonly<Record<MeleeWeapon, string>> = { katana: 'KATANA', knife: 'FACA' }

const labels = (finishes: readonly WeaponFinish[]): readonly string[] =>
  finishes.map((finish) => finish.label)

export const CLASS_LOADOUT_SPEC: readonly ChoiceSpec<ClassLoadoutKey>[] = [
  {
    key: 'primary',
    label: 'ARMA PRINCIPAL',
    choices: PRIMARY_WEAPONS.map((w) => w.label),
    fallback: 0,
  },
  // a katana é a padrão: o pedido foi "substitui a faca", e a faca fica pronta como opção.
  {
    key: 'melee',
    label: 'CORPO A CORPO',
    choices: MELEE_WEAPONS.map((w) => MELEE_LABELS[w]),
    fallback: 0,
  },
  { key: 'sniperFinish', label: 'SKIN DA SNIPER', choices: labels(SNIPER_FINISHES), fallback: 0 },
  { key: 'katanaFinish', label: 'SKIN DA KATANA', choices: labels(KATANA_FINISHES), fallback: 0 },
  { key: 'knifeFinish', label: 'SKIN DA FACA', choices: labels(KNIFE_FINISHES), fallback: 0 },
  {
    key: 'characterSkin',
    label: 'SKIN DO PERSONAGEM',
    choices: CHARACTER_SKINS.map((skin) => skin.label),
    fallback: 0,
  },
]

/** O que a partida e o render precisam da classe. */
export interface ClassKit {
  readonly meleeWeapon: MeleeWeapon
  readonly sniperFinish: WeaponFinish
  /** O acabamento da lâmina do slot de corpo a corpo. */
  readonly bladeFinish: WeaponFinish
  readonly characterSkinId: string
}

/**
 * ```ts
 * classKitOf(loadout).meleeWeapon // 'katana'
 * ```
 */
export function classKitOf(loadout: ClassLoadout): ClassKit {
  const meleeWeapon = MELEE_WEAPONS[loadout.melee] ?? 'katana'
  const bladeIndex = meleeWeapon === 'katana' ? loadout.katanaFinish : loadout.knifeFinish
  return {
    meleeWeapon,
    sniperFinish: finishAt(SNIPER_FINISHES, loadout.sniperFinish),
    bladeFinish: finishAt(BLADE_FINISHES[meleeWeapon], bladeIndex),
    characterSkinId: characterSkinAt(loadout.characterSkin).id,
  }
}

/** Onde a classe mora no armazenamento. */
export const CLASS_LOADOUT_KEY = 'shobu.classLoadout'

export function parseClassLoadout(raw: unknown): ClassLoadout {
  return parseChoices(raw, CLASS_LOADOUT_SPEC)
}

export function createClassLoadoutStore(storage: SettingsStorage): JsonStore<ClassLoadout> {
  return createJsonStore(storage, CLASS_LOADOUT_KEY, parseClassLoadout)
}
