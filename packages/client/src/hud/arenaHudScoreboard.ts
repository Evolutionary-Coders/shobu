import { type ElementQuery, requireElement } from './requireElement.ts'
import type { ScoreboardRow } from './scoreboardRows.ts'

/**
 * O placar do tab em dom: uma tabela no centro do visor, que aparece enquanto
 * a tecla está presa. Adapter puro — a ordem, as posições e o empate vêm de
 * `scoreboardRows.ts`.
 *
 * **As linhas são reaproveitadas.** Cada mudança de placar reescreve só o
 * texto das células que já existem, e só cria linha quando entra gente na
 * sala: o placar muda por kill, e recriar a tabela a cada kill seria churn de
 * dom à toa. Mostrar e esconder é atributo, e o css faz o resto.
 */
export interface ScoreboardPanel {
  setRows(rows: readonly ScoreboardRow[]): void
  setOpen(open: boolean): void
}

/** As células de uma linha, na ordem das colunas do `index.html`. */
interface RowCells {
  readonly row: HTMLTableRowElement
  readonly rank: HTMLTableCellElement
  readonly name: HTMLTableCellElement
  readonly points: HTMLTableCellElement
  readonly kills: HTMLTableCellElement
  readonly deaths: HTMLTableCellElement
}

/**
 * ```ts
 * const scoreboard = createScoreboardPanel(document, hudSection)
 * scoreboard.setRows(scoreboardRows(ranked, session.nameOf, 'local'))
 * scoreboard.setOpen(true)
 * ```
 */
export function createScoreboardPanel(root: ElementQuery, hud: HTMLElement): ScoreboardPanel {
  const body = requireElement<HTMLTableSectionElement>(root, '#hud-scoreboard-rows')
  const lines: RowCells[] = []
  return {
    setRows: (rows) => {
      while (lines.length < rows.length) lines.push(appendRow(body))
      for (const [index, line] of lines.entries()) writeRow(line, rows[index])
    },
    setOpen: (open) => {
      hud.dataset.scoreboard = open ? 'open' : 'off'
    },
  }
}

function appendRow(body: HTMLTableSectionElement): RowCells {
  const row = body.insertRow()
  row.className = 'scoreboard-row'
  const cell = (className: string): HTMLTableCellElement => {
    const created = row.insertCell()
    created.className = className
    return created
  }
  return {
    row,
    rank: cell('scoreboard-rank'),
    name: cell('scoreboard-name'),
    points: cell('scoreboard-points'),
    kills: cell('scoreboard-kills'),
    deaths: cell('scoreboard-deaths'),
  }
}

/** Linha que sobrou de quem saiu da sala fica escondida, e volta se alguém entrar. */
function writeRow(line: RowCells, row: ScoreboardRow | undefined): void {
  line.row.hidden = !row
  if (!row) return
  line.row.dataset.local = String(row.local)
  line.row.dataset.lead = String(row.rank === 1)
  line.rank.textContent = String(row.rank).padStart(2, '0')
  line.name.textContent = row.name
  line.points.textContent = String(row.points)
  line.kills.textContent = String(row.kills)
  line.deaths.textContent = String(row.deaths)
}
