import type { StaticBox } from './staticBox.ts'

/**
 * A fase larga do raio: as caixas da arena numa grade de células de 4 m no
 * plano do chão, montada **uma vez** por lista de caixas e guardada ao lado
 * dela. O raio anda célula a célula (DDA) e só testa as caixas das células
 * por onde passa, parando quando a próxima célula começa depois do acerto que
 * já tem.
 *
 * Existe porque a arte ganhou colisão (ADR 0024): o Neon-kaidō foi de 232
 * para 800 caixas com os letreiros, e o raio do gancho (um por tick, para a
 * retícula), o tiro e a linha de visão de cada bot testavam todas. Medido em
 * 12/10: o tick do núcleo de 49 para 78 µs sem a grade.
 *
 * Caixa que cobre células demais — o piso, a parede do fim do bairro, o
 * prédio do bairro — fica numa lista à parte que todo raio testa: espalhada
 * pela grade, ela repetiria em centenas de células.
 *
 * O resultado é o mesmo da varredura de todas as caixas, inclusive no empate:
 * vence o menor índice, como em `nearestBoxHit`.
 */
const CELL_M = 4
/** Caixa que cobre mais células que isto vai para a lista de sempre. */
const MAX_CELLS_PER_BOX = 48

export interface BoxGrid {
  readonly originX: number
  readonly originZ: number
  readonly columns: number
  readonly rows: number
  /** Onde a lista de cada célula começa em `cellBoxes`; a célula `c` vai até `cellStart[c + 1]`. */
  readonly cellStart: Int32Array
  readonly cellBoxes: Int32Array
  /** As caixas grandes, testadas por todo raio. */
  readonly always: Int32Array
  /** A marca de "já testada neste raio", por caixa: uma caixa em várias células é testada uma vez. */
  readonly seen: Uint32Array
  stamp: number
}

const grids = new WeakMap<readonly StaticBox[], BoxGrid>()

/**
 * A grade de uma lista de caixas, montada na primeira pergunta e reaproveitada
 * enquanto a lista existir. A lista não pode mudar depois: a arena é estática.
 *
 * ```ts
 * const grid = boxGridOf(arenaBoxes)
 * ```
 */
export function boxGridOf(boxes: readonly StaticBox[]): BoxGrid {
  const cached = grids.get(boxes)
  if (cached) return cached
  const grid = buildGrid(boxes)
  grids.set(boxes, grid)
  return grid
}

/** A faixa de colunas (ou linhas) que o intervalo `[min, max]` cobre, presa à grade. */
export function cellSpan(
  min: number,
  max: number,
  origin: number,
  count: number,
): [number, number] {
  const first = Math.floor((min - origin) / CELL_M)
  const last = Math.floor((max - origin) / CELL_M)
  return [Math.max(0, Math.min(count - 1, first)), Math.max(0, Math.min(count - 1, last))]
}

/** A célula da coluna `column` e da linha `row`. */
export function cellIndex(grid: BoxGrid, column: number, row: number): number {
  return row * grid.columns + column
}

export { CELL_M as BOX_GRID_CELL_M }

function buildGrid(boxes: readonly StaticBox[]): BoxGrid {
  const extent = extentOf(boxes)
  const columns = Math.max(1, Math.ceil((extent.maxX - extent.minX) / CELL_M))
  const rows = Math.max(1, Math.ceil((extent.maxZ - extent.minZ) / CELL_M))
  const shape = { originX: extent.minX, originZ: extent.minZ, columns, rows }
  const perCell: number[][] = Array.from({ length: columns * rows }, () => [])
  const always: number[] = []
  for (const [index, box] of boxes.entries()) {
    const cells = coveredCells(shape, box)
    if (cells.length > MAX_CELLS_PER_BOX) always.push(index)
    else for (const cell of cells) perCell[cell]?.push(index)
  }
  return {
    ...shape,
    ...packed(perCell),
    always: Int32Array.from(always),
    seen: new Uint32Array(boxes.length),
    stamp: 0,
  }
}

function extentOf(boxes: readonly StaticBox[]) {
  const extent = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  for (const box of boxes) {
    extent.minX = Math.min(extent.minX, box.minX)
    extent.maxX = Math.max(extent.maxX, box.maxX)
    extent.minZ = Math.min(extent.minZ, box.minZ)
    extent.maxZ = Math.max(extent.maxZ, box.maxZ)
  }
  return extent
}

type GridShape = Pick<BoxGrid, 'originX' | 'originZ' | 'columns' | 'rows'>

function coveredCells(shape: GridShape, box: StaticBox): readonly number[] {
  const [c0, c1] = cellSpan(box.minX, box.maxX, shape.originX, shape.columns)
  const [r0, r1] = cellSpan(box.minZ, box.maxZ, shape.originZ, shape.rows)
  const cells: number[] = []
  for (let row = r0; row <= r1; row += 1) {
    for (let column = c0; column <= c1; column += 1) cells.push(row * shape.columns + column)
  }
  return cells
}

function packed(perCell: readonly (readonly number[])[]): Pick<BoxGrid, 'cellStart' | 'cellBoxes'> {
  const cellStart = new Int32Array(perCell.length + 1)
  for (const [cell, list] of perCell.entries())
    cellStart[cell + 1] = (cellStart[cell] as number) + list.length
  return { cellStart, cellBoxes: Int32Array.from(perCell.flat()) }
}
