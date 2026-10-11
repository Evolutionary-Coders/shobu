/**
 * Uma skin de personagem que a EDITAR CLASSE oferece: o id que o avatar
 * carrega e o nome que a tela escreve.
 *
 * **Ponto de junção com o catálogo de skins** (a frente dos personagens
 * humanos cria o dela): quando ele chegar, `CHARACTER_SKINS` passa a ser a
 * lista dele mapeada para esta forma, e a classe guardada continua valendo —
 * ela guarda o índice, e o índice zero é sempre a padrão. Até lá, a lista tem
 * o competidor de hoje.
 */
export interface CharacterSkin {
  readonly id: string
  readonly label: string
}

export const CHARACTER_SKINS: readonly CharacterSkin[] = [{ id: 'padrao', label: 'PADRÃO' }]

/**
 * ```ts
 * characterSkinAt(0).id // 'padrao'
 * ```
 */
export function characterSkinAt(index: number): CharacterSkin {
  return CHARACTER_SKINS[index] ?? (CHARACTER_SKINS[0] as CharacterSkin)
}
