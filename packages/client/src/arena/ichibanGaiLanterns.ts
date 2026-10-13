/**
 * Os fios de lanterna do Ichiban-gai, os mesmos que o blender pendura
 * (`arena_skin.WIRES` e `arena_chinatown.FESTIVE_WIRES`). Mexer num fio aqui
 * sem mexer lá — ou o contrário — reprova o teste que confere as lanternas
 * contra o glb publicado.
 */
import { type LanternWire, wireLanterns, withHalfTurnWires } from './lanternWires.ts'
import type { PropCollider } from './propCollider.ts'

const wire = (start: LanternWire['start'], end: LanternWire['end'], sagM: number): LanternWire => ({
  start,
  end,
  sagM,
})

/** Os fios da arena: do terraço do pachinko, por cima da avenida e da rua norte. */
const ARENA_WIRES: readonly LanternWire[] = [
  wire([-26, 9.5, 10], [-17, 4.4, 10], 0.35),
  wire([-26, 10.5, 15], [-17, 4.4, 15], 0.4),
  wire([-26, 9.0, 18.5], [-17, 4.4, 18.5], 0.3),
  wire([-7, 4.3, 12], [7, 8.6, 12], 0.7),
  wire([-7, 4.3, 17], [7, 8.6, 17.5], 0.8),
  wire([10, 12.5, 32], [10, 8.8, 22], 0.4),
  wire([14, 13.5, 32], [14, 8.8, 22], 0.45),
  wire([-10, 11, 32], [-10, 4.4, 20], 0.6),
]

/** Os fios de festa das ruas do bairro. */
const FESTIVE_WIRES: readonly LanternWire[] = [
  wire([-9, 8.0, 36], [9, 8.5, 36], 0.9),
  wire([-9, 8.5, 42], [9, 8.0, 42], 0.9),
  wire([-9, 8.0, 48], [9, 8.5, 48], 0.9),
  wire([-9, 8.5, 54], [9, 8.0, 54], 0.9),
  wire([-30, 7.0, 8], [-30, 7.5, -8], 0.8),
  wire([-36, 7.5, 8], [-36, 7.0, -8], 0.8),
  wire([26, 7.5, 24], [26, 8.0, 32], 0.4),
  wire([34, 7.5, 24], [34, 7.5, 32], 0.4),
  wire([-7, 4.3, 9.5], [7, 8.5, 11], 0.7),
  wire([-7, 4.3, 14.5], [7, 8.6, 14.5], 0.7),
]

/**
 * ```ts
 * ichibanGaiLanterns().length // uma caixa por lanterna da arte
 * ```
 */
export function ichibanGaiLanterns(): readonly PropCollider[] {
  return wireLanterns('lanterna', withHalfTurnWires([...ARENA_WIRES, ...FESTIVE_WIRES]))
}
