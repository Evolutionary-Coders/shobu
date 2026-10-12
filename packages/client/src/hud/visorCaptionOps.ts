import { text, type VisorOp } from './visorDraw.ts'
import { VISOR_PALETTE } from './visorPalette.ts'

/**
 * A legenda do narrador no visor do óculos (ADR 0012): o dom não aparece no
 * estéreo, então a fala é escrita no canvas, logo acima do cartão de abate —
 * a mesma ordem do desktop (`narratorCaption.css`).
 */

/**
 * Quantos caracteres cabem numa linha da legenda, no corpo de 26 px. As falas
 * mais longas dos manifestos têm ~56 (a apresentação do ATLAS): duas linhas.
 */
export const CAPTION_LINE_CHARS = 40

/** A linha de base da última linha: acima da placa do cartão de abate (y 468). */
const CAPTION_BOTTOM_PX = 446
const CAPTION_LINE_PX = 30
const CAPTION_SIZE_PX = 26

/**
 * Quebra a fala em linhas de até `maxChars`, só em espaço. Palavra maior que a
 * linha fica inteira numa linha própria: cortar no meio leria pior do que
 * passar da margem.
 *
 * ```ts
 * wrapCaption('Combatentes prontos. Mapa renderizado.', 24)
 * // ['Combatentes prontos.', 'Mapa renderizado.']
 * ```
 */
export function wrapCaption(caption: string, maxChars: number): readonly string[] {
  const lines: string[] = []
  for (const word of caption.trim().split(/\s+/)) {
    const last = lines.at(-1)
    if (last !== undefined && last.length + 1 + word.length <= maxChars) {
      lines[lines.length - 1] = `${last} ${word}`
    } else {
      lines.push(word)
    }
  }
  return lines
}

/**
 * A legenda numa placa, centrada na largura do visor, crescendo para cima a
 * partir da base.
 *
 * ```ts
 * captionOps('Headshot.', VISOR_SIZE.width) // placa + uma linha
 * ```
 */
export function captionOps(caption: string | null, visorWidth: number): readonly VisorOp[] {
  if (caption === null) return []
  const lines = wrapCaption(caption, CAPTION_LINE_CHARS)
  const centerX = visorWidth / 2
  const widest = Math.max(...lines.map((line) => line.length))
  const width = Math.min(visorWidth - 80, widest * CAPTION_SIZE_PX * 0.52 + 40)
  const top = CAPTION_BOTTOM_PX - lines.length * CAPTION_LINE_PX - 4
  return [
    { kind: 'plate', x: centerX - width / 2, y: top, width, height: CAPTION_BOTTOM_PX - top + 12 },
    ...lines.map((line, index) =>
      text(
        centerX,
        CAPTION_BOTTOM_PX - (lines.length - 1 - index) * CAPTION_LINE_PX,
        line,
        CAPTION_SIZE_PX,
        VISOR_PALETTE.white,
        'center',
        'tech',
      ),
    ),
  ]
}
