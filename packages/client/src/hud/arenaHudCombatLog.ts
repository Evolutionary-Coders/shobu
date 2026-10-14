import { createGlyphLabel, type GlyphLabel } from './hudComponentsDom.ts'
import type { GlyphSheet } from './hudGlyphText.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * O registro de combate, à direita no meio: o `COMBAT LOG` do Metal Gear
 * Rising, com os números em caixa e o kanji de cada linha. Três linhas —
 * abates (殺), sequência atual (連) e medalhas da partida (章). Os kanji e os
 * rótulos são fixos e moram no `index.html`; aqui só se escrevem os números.
 */
export interface HudScore {
  readonly kills: number
  /** Abates seguidos sem morrer, do placar do jogador local. */
  readonly streak: number
  readonly points: number
  /** As medalhas da partida, do placar do jogador local (`PlayerScore.medals`). */
  readonly medals: number
}

export interface CombatLog {
  setScore(score: HudScore): void
}

const TALLY_HEIGHT_PX = 15

/**
 * As três linhas saem do placar, as medalhas também: somá-las aqui, kill a
 * kill, deixava o registro com as medalhas da partida anterior quando o
 * placar zerava na seguinte.
 *
 * ```ts
 * const log = createCombatLog(document, sheet)
 * log.setScore({ kills: 1, streak: 1, points: 100, medals: 2 })
 * ```
 */
export function createCombatLog(root: ElementQuery, sheet: GlyphSheet): CombatLog {
  const tally = (selector: string): GlyphLabel =>
    createGlyphLabel(requireElement<HTMLElement>(root, selector), {
      sheet,
      heightPx: TALLY_HEIGHT_PX,
    })
  const kills = tally('#hud-tally-kills')
  const streak = tally('#hud-tally-streak')
  const medals = tally('#hud-tally-medals')
  return {
    setScore: (score) => {
      kills.write(`${score.kills}`)
      streak.write(`${score.streak}`)
      medals.write(`${score.medals}`)
    },
  }
}
