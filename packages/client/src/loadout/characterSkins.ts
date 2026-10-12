import { DEFAULT_PLAYER_SKIN, HUMAN_SKINS } from '../character/humanSkins.ts'

/**
 * Uma skin de personagem que a EDITAR CLASSE oferece: o id que o avatar
 * carrega e o nome que a tela escreve.
 *
 * A lista é o catálogo dos humanos (`character/humanSkins.ts`) com a padrão do
 * jogador na frente: a classe guarda o **índice**, e o índice zero tem que ser
 * sempre a padrão — uma classe salva sem escolha continua valendo.
 */
export interface CharacterSkin {
  readonly id: string
  readonly label: string
  /**
   * O retrato da EDITAR CLASSE, servido de `public/`: busto em 3/4 contra o
   * fundo do menu, renderizado do próprio glb por `npm run render:human-portraits`.
   */
  readonly thumbnailUrl: string
}

export const CHARACTER_SKINS: readonly CharacterSkin[] = [
  ...HUMAN_SKINS.filter((skin) => skin.id === DEFAULT_PLAYER_SKIN),
  ...HUMAN_SKINS.filter((skin) => skin.id !== DEFAULT_PLAYER_SKIN),
].map((skin) => ({
  id: skin.id,
  label: skin.displayName.toUpperCase(),
  thumbnailUrl: `/assets/images/loadout/human-${skin.id}.webp`,
}))

/**
 * ```ts
 * characterSkinAt(0).id // 'ronin'
 * ```
 */
export function characterSkinAt(index: number): CharacterSkin {
  return CHARACTER_SKINS[index] ?? (CHARACTER_SKINS[0] as CharacterSkin)
}
