/**
 * A sombra de contato do competidor: um disco escuro e esfumado no chão, sob
 * os pés.
 *
 * O material da arena é bake com a luz desligada (`loadArenaScenery.ts`), então
 * nada que se mexe projeta sombra nele, e o competidor parecia flutuar sobre o
 * asfalto (06/10). Sombra de verdade exigiria reescrever o material do bake;
 * o disco é o que o valorant também põe sob o agente de longe, e é o que
 * assenta o corpo no chão para o olho.
 *
 * Dado puro: quem o põe na cena é `attachContactShadow.ts`.
 */

export interface ContactShadowSpec {
  /** O raio do disco no chão, em metros: um pouco mais que o ombro do mannequin. */
  readonly radiusM: number
  /** A opacidade no centro. Abaixo de 1: é sombra de céu aberto, não buraco. */
  readonly centreOpacity: number
  /** O lado da textura, em pixels. */
  readonly sizePx: number
}

export function contactShadowSpec(): ContactShadowSpec {
  return { radiusM: 0.6, centreOpacity: 0.7, sizePx: 64 }
}

/**
 * A opacidade a uma fração `distance` do raio: cheia no centro, caindo até
 * zero na borda sem degrau — um disco de borda dura lê como mancha pintada.
 *
 * ```ts
 * contactShadowOpacity(0, 0.7) // 0.7
 * contactShadowOpacity(1, 0.7) // 0
 * ```
 */
export function contactShadowOpacity(distance: number, centreOpacity: number): number {
  if (distance >= 1) return 0
  // queda de 1 − d²: com o quadrado dela, testado em 06/10, só o miolo sob os
  // pés escurecia, e no asfalto à sombra o disco sumia.
  return centreOpacity * (1 - distance * distance)
}

/**
 * A textura RGBA do disco: preta, com a opacidade no alfa.
 *
 * ```ts
 * paintContactShadow(contactShadowSpec()) // Uint8Array de 64 × 64 × 4
 * ```
 */
export function paintContactShadow(spec: ContactShadowSpec): Uint8Array<ArrayBuffer> {
  const size = spec.sizePx
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError(`sizePx recebeu ${size}; esperado inteiro ≥ 2`)
  }
  const pixels = new Uint8Array(size * size * 4)
  const half = size / 2
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const distance = Math.hypot(column + 0.5 - half, row + 0.5 - half) / half
      const alpha = Math.round(contactShadowOpacity(distance, spec.centreOpacity) * 255)
      pixels[(row * size + column) * 4 + 3] = alpha
    }
  }
  return pixels
}
