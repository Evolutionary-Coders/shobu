import type { GameplayConfig } from '@shobu/core'
import { BOUNDARY_WARNING_TITLE, boundaryTenths, boundaryTone } from './boundaryWarning.ts'
import { createGlyphLabel, type GlyphLabel, writeThinBar } from './hudComponentsDom.ts'
import type { GlyphSheet } from './hudGlyphText.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import { tenthsLabel } from './tenths.ts'
import { thinBarFraction } from './thinBar.ts'

/**
 * O aviso de fora da área de jogo: a ordem e a contagem em glifo, e uma barra
 * vermelha que esvazia com `match.outOfBoundsGraceS`.
 */
export interface BoundaryWarningPanel {
  /** Os segundos que faltam, ou `null` para apagar o aviso. */
  set(remainingS: number | null): void
}

export interface BoundaryWarningOptions {
  readonly root: ElementQuery
  readonly sheet: GlyphSheet
  readonly config: GameplayConfig
}

const TITLE_HEIGHT_PX = 24
const COUNTDOWN_HEIGHT_PX = 56

/**
 * O tom vira atributo e o css decide cor e pisca; o número e a barra só são
 * escritos com o aviso no ar, porque apagados eles não são lidos por ninguém.
 *
 * ```ts
 * const boundary = createBoundaryWarning({ root: document, sheet, config })
 * boundary.set(4.9)
 * ```
 */
export function createBoundaryWarning(options: BoundaryWarningOptions): BoundaryWarningPanel {
  const graceS = options.config.match.outOfBoundsGraceS
  const hud = requireElement<HTMLElement>(options.root, '#arena-hud')
  const bar = requireElement<HTMLElement>(options.root, '#hud-boundary-bar')
  const countdown = boundaryLabels(options)
  return {
    set: (remainingS) => {
      const tenths = boundaryTenths(remainingS)
      hud.dataset.boundary = boundaryTone(tenths)
      if (tenths === null) return
      countdown.write(tenthsLabel(tenths))
      writeThinBar(bar, thinBarFraction(tenths / 10, graceS))
    },
  }
}

/** Escreve o título e devolve a contagem, que é o único texto que muda. */
function boundaryLabels(options: BoundaryWarningOptions): GlyphLabel {
  const { root, sheet } = options
  // o título é fixo: escrito uma vez aqui, para o texto ter uma cópia só.
  createGlyphLabel(requireElement(root, '.boundary-title'), {
    sheet,
    heightPx: TITLE_HEIGHT_PX,
  }).write(BOUNDARY_WARNING_TITLE)
  // sem glitch: a contagem troca dez vezes por segundo, e um tremor de 120 ms
  // a cada 100 ms seria o número tremendo sem parar.
  return createGlyphLabel(requireElement(root, '.boundary-countdown'), {
    sheet,
    heightPx: COUNTDOWN_HEIGHT_PX,
    glitch: false,
  })
}
