/**
 * O killfeed: as últimas mortes, mais recente no topo.
 *
 * **Sem relógio.** A linha some por animação de css, casada com
 * `KILLFEED_LIFETIME_MS`; este módulo só limita a capacidade e formata. É o que
 * mantém a promessa de o hud não ter `setTimeout` nem `requestAnimationFrame`
 * disputando quadro com o render (nfr.md).
 */
export type KillWeaponLabel = 'SNIPER' | 'FACA'

export const KILLFEED_CAPACITY = 4

/** Casado com `kill-line-out` em arenaVisor.css. */
export const KILLFEED_LIFETIME_MS = 5_700

/** Acima disto o apelido estoura a coluna do visor e empurra o resto da linha. */
export const KILLFEED_NAME_MAX = 12

export interface KillEntry {
  readonly killer: string
  readonly victim: string
  readonly weapon: KillWeaponLabel
  /** Quem matou foi o jogador local. Muda o tom da linha, não o texto. */
  readonly mine: boolean
}

export interface KillfeedLine {
  readonly text: string
  readonly tone: 'mine' | 'theirs'
}

export interface Killfeed {
  /** Empilha a morte e devolve as linhas a desenhar, da mais nova para a mais velha. */
  push(entry: KillEntry): readonly KillfeedLine[]
}

/**
 * ```ts
 * formatKillLine({ killer: 'VOCÊ', victim: 'ONRYO', weapon: 'SNIPER', mine: true })
 * // 'VOCÊ ✕ ONRYO'
 * ```
 */
export function formatKillLine(entry: KillEntry): string {
  return `${shorten(entry.killer)} ✕ ${shorten(entry.victim)}`
}

export function createKillfeed(capacity: number = KILLFEED_CAPACITY): Killfeed {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity recebeu ${capacity}; esperado inteiro >= 1`)
  }
  const lines: KillfeedLine[] = []
  return {
    push: (entry) => {
      lines.unshift({ text: formatKillLine(entry), tone: entry.mine ? 'mine' : 'theirs' })
      lines.length = Math.min(lines.length, capacity)
      return lines
    },
  }
}

/** Reticências e não corte seco: apelido cortado no meio parece defeito de fonte. */
function shorten(name: string): string {
  const points = [...name]
  if (points.length <= KILLFEED_NAME_MAX) return name
  return `${points.slice(0, KILLFEED_NAME_MAX - 1).join('')}…`
}
