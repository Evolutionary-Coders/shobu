import type { KillWeapon } from '@shobu/core'
import { LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import { type KillCircumstances, type KillTag, killTagsOf } from './killTags.ts'

/**
 * O killfeed: as últimas mortes, mais recente no topo, com a arma e as marcas
 * de como cada uma aconteceu (`killTags.ts`) desenhadas em ícone.
 *
 * **Sem relógio.** A linha some por animação de css, casada com
 * `KILLFEED_LIFETIME_MS`; este módulo só limita a capacidade e formata. É o que
 * mantém a promessa de o hud não ter `setTimeout` nem `requestAnimationFrame`
 * disputando quadro com o render (nfr.md).
 */
export const KILLFEED_CAPACITY = 4

/** Casado com `kill-line-out` em arenaPanels.css. */
export const KILLFEED_LIFETIME_MS = 5_700

/** Acima disto o apelido estoura a coluna do killfeed e empurra o resto da linha. */
export const KILLFEED_NAME_MAX = 12

export interface KillEntry {
  readonly killer: string
  readonly victim: string
  readonly weapon: KillWeapon
  /** Cabeça, luneta, ar, gancho: os ícones depois da arma. */
  readonly tags: readonly KillTag[]
  /** Quem matou foi o jogador local. Muda o tom da linha, não o texto. */
  readonly mine: boolean
  /** Quem morreu foi o jogador local. Também só muda o tom. */
  readonly fatal?: boolean
}

export interface KillEntryNames {
  readonly killer: string
  readonly victim: string
}

export interface KillfeedLine {
  /** Os nomes, já encurtados para a coluna. */
  readonly killer: string
  readonly victim: string
  /** `mine`: o jogador matou. `fatal`: o jogador morreu. `theirs`: os outros entre si. */
  readonly tone: 'mine' | 'fatal' | 'theirs'
  /** A arma: o ícone entre os nomes, e o tom da linha de lâmina no css. */
  readonly weapon: KillWeapon
  readonly tags: readonly KillTag[]
}

export interface Killfeed {
  /** Empilha a morte e devolve as linhas a desenhar, da mais nova para a mais velha. */
  push(entry: KillEntry): readonly KillfeedLine[]
  /**
   * Esquece as mortes: a partida nova começa com o feed vazio. Sem isso, a
   * primeira kill dela redesenhava as três últimas da partida anterior.
   */
  clear(): void
}

export function createKillfeed(capacity: number = KILLFEED_CAPACITY): Killfeed {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity recebeu ${capacity}; esperado inteiro >= 1`)
  }
  const lines: KillfeedLine[] = []
  return {
    push: (entry) => {
      lines.unshift({
        killer: shorten(entry.killer),
        victim: shorten(entry.victim),
        tone: toneOf(entry),
        weapon: entry.weapon,
        tags: entry.tags,
      })
      lines.length = Math.min(lines.length, capacity)
      return lines
    },
    clear: () => {
      lines.length = 0
    },
  }
}

function toneOf(entry: KillEntry): KillfeedLine['tone'] {
  if (entry.mine) return 'mine'
  return entry.fatal ? 'fatal' : 'theirs'
}

/**
 * A linha de uma kill do registro do quadro, com os nomes que a sessão dá aos
 * ids do placar. O jogador local é `local` no placar e o nome de perfil na tela.
 *
 * ```ts
 * killEntryOf(session.lastKills.slots[0], session.nameOf)
 * // { killer: 'ONRYO', victim: 'RAIDEN', weapon: 'knife', tags: [], mine: false, fatal: true }
 * ```
 */
export function killEntryOf(
  notice: KillCircumstances & { readonly shooterId: string; readonly victimId: string },
  nameOf: (playerId: string) => string,
): KillEntry {
  return {
    killer: nameOf(notice.shooterId),
    victim: nameOf(notice.victimId),
    weapon: notice.weapon,
    tags: killTagsOf(notice),
    mine: notice.shooterId === LOCAL_PLAYER_ID,
    fatal: notice.victimId === LOCAL_PLAYER_ID,
  }
}

/** Reticências e não corte seco: apelido cortado no meio parece defeito de fonte. */
function shorten(name: string): string {
  const points = [...name]
  if (points.length <= KILLFEED_NAME_MAX) return name
  return `${points.slice(0, KILLFEED_NAME_MAX - 1).join('')}…`
}
