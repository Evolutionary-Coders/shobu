import type { GlitchBand } from './jackIn.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

export interface JackInLayerOptions {
  readonly bands: readonly GlitchBand[]
  readonly readout: readonly string[]
}

/**
 * Adapter de dom da transição, irmão do `domLineSink`: monta as faixas de
 * interferência e o mostrador **no boot**, não no momento do salto.
 *
 * Algumas dezenas de nós são baratas, mas não no quadro em que o jogador
 * acabou de ganhar o controle — é justamente o quadro que o nfr.md não deixa
 * gastar. Montado antes, o salto inteiro vira troca de um atributo.
 *
 * Sem teste unitário pelo mesmo motivo do `domLineSink`: os testes rodam em
 * node, sem documento (adr 0001). O que dá para testar é o dado, e ele está em
 * `jackIn.ts`.
 *
 * ```ts
 * mountJackInLayer(document, { bands: buildGlitchBands(...), readout: buildJackInReadout() })
 * ```
 */
export function mountJackInLayer(root: ElementQuery, options: JackInLayerOptions): void {
  const glitch = requireElement<HTMLElement>(root, '#jack-glitch')
  const readout = requireElement<HTMLElement>(root, '#jack-readout')
  glitch.replaceChildren(...options.bands.map((band) => createBand(glitch, band)))
  readout.replaceChildren(
    ...options.readout.map((text, index) => createReadoutLine(readout, text, index)),
  )
}

/** A faixa é geometria pura: posição e tempo entram como custom properties. */
function createBand(target: HTMLElement, band: GlitchBand): HTMLElement {
  const element = target.ownerDocument.createElement('span')
  element.className = 'jack-band'
  element.style.setProperty('--band-top', `${band.topPct}%`)
  element.style.setProperty('--band-height', `${band.heightVh}vh`)
  element.style.setProperty('--band-delay', `${band.delayMs}ms`)
  element.style.setProperty('--band-time', `${band.durationMs}ms`)
  element.style.setProperty('--band-dir', String(band.direction))
  return element
}

function createReadoutLine(target: HTMLElement, text: string, index: number): HTMLElement {
  const element = target.ownerDocument.createElement('p')
  element.className = 'jack-readout-line'
  element.style.setProperty('--line', String(index))
  element.textContent = text
  return element
}
