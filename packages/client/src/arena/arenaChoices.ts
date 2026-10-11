/**
 * Um mapa que a NOVA PARTIDA oferece: o id que a partida carrega e o nome que
 * a tela escreve.
 *
 * **Ponto de junção com o catálogo de mapas** (`arena/arenaCatalog.ts`, que
 * nasce em outra frente): quando ele chegar, `MATCH_ARENAS` passa a ser a
 * lista dele mapeada para esta forma, e nada mais no menu muda — o menu só
 * conhece id e rótulo. Até lá, a lista tem o único mapa que existe.
 */
export interface ArenaChoice {
  readonly id: string
  readonly label: string
}

export const MATCH_ARENAS: readonly ArenaChoice[] = [{ id: 'ichiban-gai', label: 'ICHIBAN-GAI' }]

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
