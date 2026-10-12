import { catalogChoices } from './arenaCatalog.ts'

/**
 * Um mapa que a NOVA PARTIDA oferece: o id que a partida carrega e o nome que
 * a tela escreve.
 *
 * A lista é o catálogo de mapas (`arenaCatalog.ts`) nesta forma: o menu só
 * conhece id e rótulo, e o primeiro do catálogo é o padrão.
 */
export interface ArenaChoice {
  readonly id: string
  readonly label: string
}

export const MATCH_ARENAS: readonly ArenaChoice[] = catalogChoices()

/**
 * O mapa do índice, ou o primeiro: a escolha guardada pode apontar para um mapa
 * que esta versão não tem.
 *
 * ```ts
 * arenaChoiceAt(0).id // 'ichiban-gai'
 * ```
 */
export function arenaChoiceAt(index: number): ArenaChoice {
  return MATCH_ARENAS[index] ?? (MATCH_ARENAS[0] as ArenaChoice)
}
