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
  /** A linha escolhida para expulsar e a dica das teclas (`ScoreboardKick`). */
  setKick(kick: ScoreboardKick): void
}

/**
 * A escolha do tab para o voto de expulsão (ADR 0034): a linha marcada, pelo
 * id da sala, e se a dica `[RODA] SELECIONAR [K] VOTAR PARA EXPULSAR` aparece
 * — só online, e só com alguém para votar.
 */
export interface ScoreboardKick {
  readonly selected: string | undefined
  readonly hint: boolean
}

/** As células de uma linha, na ordem das colunas do `index.html`. */
interface RowCells {
  readonly row: HTMLTableRowElement
  readonly rank: HTMLTableCellElement
  readonly name: HTMLTableCellElement
  readonly points: HTMLTableCellElement
  readonly kills: HTMLTableCellElement
  readonly deaths: HTMLTableCellElement
  readonly ping: HTMLTableCellElement
}

/**
 * ```ts
 * const scoreboard = createScoreboardPanel(document, hudSection)
 * scoreboard.setRows(scoreboardRows(ranked, session.nameOf, 'local', session.pingOf))
 * scoreboard.setOpen(true)
 * ```
 */
export function createScoreboardPanel(root: ElementQuery, hud: HTMLElement): ScoreboardPanel {
  const body = requireElement<HTMLTableSectionElement>(root, '#hud-scoreboard-rows')
  const lines: RowCells[] = []
  const hint = appendKickHint(requireElement<HTMLElement>(root, '#hud-scoreboard'))
  const kick = { selected: undefined as string | undefined }
  // a ordem muda a cada kill, e a marca segue o jogador, e não a linha.
  const mark = (): void => {
    for (const line of lines) {
      const roomId = line.row.dataset.roomId
      line.row.dataset.kickSelected = String(roomId !== '' && roomId === kick.selected)
    }
  }
  return {
    setKick: ({ selected, hint: hinted }) => {
      hint.hidden = !hinted
      kick.selected = selected
      mark()
    },
    setRows: (rows) => {
      while (lines.length < rows.length) lines.push(appendRow(body))
      for (const [index, line] of lines.entries()) writeRow(line, rows[index])
      mark()
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
    ping: cell('scoreboard-ping'),
  }
}

/** Linha que sobrou de quem saiu da sala fica escondida, e volta se alguém entrar. */
function writeRow(line: RowCells, row: ScoreboardRow | undefined): void {
  line.row.hidden = !row
  if (!row) return
  line.row.dataset.local = String(row.local)
  line.row.dataset.roomId = row.roomId ?? ''
  line.row.dataset.lead = String(row.rank === 1)
  line.rank.textContent = String(row.rank).padStart(2, '0')
  line.name.textContent = row.name
  line.points.textContent = String(row.points)
  line.kills.textContent = String(row.kills)
  line.deaths.textContent = String(row.deaths)
  line.ping.textContent = row.ping
}

/** A dica do voto de expulsão embaixo da tabela, montada aqui: o `index.html` está no teto de linhas. */
function appendKickHint(panel: HTMLElement): HTMLElement {
  const hint = panel.ownerDocument.createElement('p')
  hint.className = 'scoreboard-kick-hint'
  hint.textContent = '[RODA] SELECIONAR  [K] VOTAR PARA EXPULSAR'
  hint.hidden = true
  panel.append(hint)
  return hint
}
