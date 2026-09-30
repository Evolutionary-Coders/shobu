import {
  type GlyphRun,
  type GlyphSheet,
  glyphMaskPosition,
  layoutGlyphText,
  runMaskSize,
} from './hudGlyphText.ts'

/**
 * Os componentes do hud no dom: texto de glifo e barra fina. A conta é dos
 * módulos puros (`hudGlyphText.ts`, `thinBar.ts`); aqui só se escreve estilo.
 * O desenho de cada peça está em `arenaComponents.css`.
 */
export interface GlyphLabel {
  /** Escreve o texto. O mesmo texto de novo não toca o dom nem pisca. */
  write(text: string): void
}

export interface GlyphLabelOptions {
  readonly sheet: GlyphSheet
  readonly heightPx: number
}

/**
 * Transforma `target` numa linha de glifos. O glitch roda a cada troca de
 * texto, **menos a primeira**: o valor inicial é o hud nascendo, e não um
 * número mudando.
 *
 * ```ts
 * const clock = createGlyphLabel(element, { sheet, heightPx: 22 })
 * clock.write('05')
 * ```
 */
export function createGlyphLabel(target: HTMLElement, options: GlyphLabelOptions): GlyphLabel {
  const state = { shown: null as string | null, glitch: 'a' }
  target.classList.add('glyph-text')
  target.style.setProperty('--glyph-h', `${options.heightPx}px`)
  return {
    write: (text) => {
      if (text === state.shown) return
      const first = state.shown === null
      state.shown = text
      paintGlyphRun(target, layoutGlyphText(options.sheet, text, options.heightPx))
      // o glifo é máscara, e máscara não se lê: o texto vai no rótulo, e o
      // markup dá `role="img"` onde um leitor de tela precisa dele.
      target.setAttribute('aria-label', text)
      if (first) return
      // alternar o nome da animação é o que a reinicia (ver arenaReticle.css).
      state.glitch = state.glitch === 'a' ? 'b' : 'a'
      target.dataset.glitch = state.glitch
    },
  }
}

/**
 * Reaproveita os `span` quando o número de glifos é o mesmo: o relógio troca
 * um dígito por segundo, e recriar nós a cada troca é churn à toa.
 */
function paintGlyphRun(target: HTMLElement, run: GlyphRun): void {
  target.style.setProperty('--glyph-atlas', runMaskSize(run))
  if (target.childElementCount !== run.glyphs.length) {
    const document = target.ownerDocument
    target.replaceChildren(...run.glyphs.map(() => document.createElement('span')))
  }
  const spans = Array.from(target.children) as HTMLElement[]
  run.glyphs.forEach((glyph, index) => {
    const span = spans[index] as HTMLElement
    span.style.width = `${glyph.widthPx}px`
    span.style.maskPosition = glyphMaskPosition(glyph)
  })
}

/**
 * O quanto a barra está cheia, de 0 a 1 (`thinBarFraction`). O fantasma é
 * transição de css, então escrever o número é tudo que a barra precisa.
 *
 * ```ts
 * writeThinBar(bar, thinBarFraction(secondsLeft, durationS))
 * ```
 */
export function writeThinBar(bar: HTMLElement, fraction: number): void {
  bar.style.setProperty('--bar-fill', `${fraction}`)
}

/**
 * Em quantos trechos as marcas cortam a barra (`thinBarDivisions`).
 *
 * ```ts
 * writeThinBarDivisions(bar, thinBarDivisions(durationS, 60))
 * ```
 */
export function writeThinBarDivisions(bar: HTMLElement, divisions: number): void {
  bar.classList.add('thin-bar--divided')
  bar.style.setProperty('--bar-divisions', `${divisions}`)
}
