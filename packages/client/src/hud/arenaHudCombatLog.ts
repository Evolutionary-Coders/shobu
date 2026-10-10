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
}

export interface CombatLog {
  setScore(score: HudScore): void
  /** Soma as medalhas de uma kill ao total. */
  addMedals(count: number): void
}

const TALLY_HEIGHT_PX = 15

/**
 * O total de medalhas é somado **aqui**, e não lido do placar: o placar não
 * guarda medalha nenhuma, e a única fonte delas é o `pushMedals` de cada kill.
 *
 * **Não zera quando a partida recomeça**, porque o placar também não zera: o
 * `restartMatch` da sessão só volta o relógio, e um registro com 12 abates e 0
 * medalhas seria a tela discordando dela mesma.
 *
 * ```ts
 * const log = createCombatLog(document, sheet)
 * log.setScore({ kills: 1, streak: 1, points: 100 })
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
  const state = { medals: 0 }
  medals.write('0')
  return {
    setScore: (score) => {
      kills.write(`${score.kills}`)
      streak.write(`${score.streak}`)
    },
    addMedals: (count) => {
      if (count === 0) return
      state.medals += count
      medals.write(`${state.medals}`)
    },
  }
}
