/**
 * Onde mora o analógico do toque: um anel fixo no canto de baixo à esquerda e
 * a zona da tela que o liga. É o desenho do Call of Duty Mobile — o polegar
 * sabe onde o analógico está sem olhar, e encostar perto da moldura não deixa
 * mais a origem colada na borda, sem curso para o lado de fora.
 *
 * Dado puro: as caixas vêm do dom (`hud/touchControls.ts` mede o anel e a
 * zona), e quem decide o papel de cada dedo é `touchRouter.ts`.
 */

/** Um retângulo de tela em px css, como o `getBoundingClientRect` devolve. */
export interface TouchRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface TouchPoint {
  readonly x: number
  readonly y: number
}

export interface TouchStickLayout {
  /** O centro do anel: a origem fixa do analógico. */
  readonly base: TouchPoint
  /** O curso inteiro, em px: o polegar a este raio da base é o analógico no fim. */
  readonly radius: number
  /** O dedo que encosta aqui anda; fora daqui, mira. */
  readonly zone: TouchRect
}

/**
 * O analógico a partir das duas caixas medidas: a base é o centro do anel, e
 * o raio é metade da largura dele — o pino no fim do curso encosta na borda
 * do anel desenhado.
 *
 * ```ts
 * stickLayoutFromRects(
 *   { left: 28, top: 238, right: 156, bottom: 366 },
 *   { left: 20, top: 130, right: 320, bottom: 374 },
 * ) // { base: { x: 92, y: 302 }, radius: 64, zone: ... }
 * ```
 */
export function stickLayoutFromRects(ring: TouchRect, zone: TouchRect): TouchStickLayout {
  return {
    base: { x: (ring.left + ring.right) / 2, y: (ring.top + ring.bottom) / 2 },
    radius: (ring.right - ring.left) / 2,
    zone,
  }
}

/**
 * Se o dedo encostou na zona do analógico. A borda conta como dentro: o
 * polegar que pousa na linha não pode virar mira por um px.
 *
 * ```ts
 * isInStickZone({ x: 60, y: 300 }, layout) // true
 * ```
 */
export function isInStickZone(at: TouchPoint, layout: TouchStickLayout): boolean {
  const zone = layout.zone
  return at.x >= zone.left && at.x <= zone.right && at.y >= zone.top && at.y <= zone.bottom
}
