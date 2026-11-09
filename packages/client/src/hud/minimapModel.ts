import type { ArenaLayer, ArenaLayout, PlayArea } from '@shobu/core'

/**
 * O minimapa do hud (ADR 0035), em dado puro: o modelo diz **o que** e
 * **onde**, e só o adapter (`minimapCanvas.ts`) sabe de canvas, como o visor
 * do óculos. O mapa gira com o jogador: para onde ele olha é sempre para cima.
 *
 * O mundo é o do babylon, de mão esquerda: x à direita, z à frente. A planta
 * é o chão visto de cima, em (x, z).
 */

/** Como cada bloco aparece na planta: cheio, só o contorno, ou apagado. */
export type MinimapRectStyle = 'solid' | 'outline' | 'dim'

export interface MinimapRect {
  readonly xM: number
  readonly zM: number
  readonly widthM: number
  readonly depthM: number
  readonly style: MinimapRectStyle
}

/** A planta fixa de um mapa: os blocos vistos de cima e a borda da área de jogo. */
export interface MinimapPlan {
  readonly arenaId: string
  readonly rects: readonly MinimapRect[]
  readonly playArea: PlayArea
}

/**
 * O estilo de cada camada; `undefined` fica fora da planta. O chão e a laje
 * fina da fachada não dizem nada visto de cima, e só sujariam o desenho.
 */
const STYLE_BY_LAYER: Readonly<Record<ArenaLayer, MinimapRectStyle | undefined>> = {
  floor: undefined,
  ledge: undefined,
  building: 'solid',
  tower: 'solid',
  walkway: 'solid',
  barrier: 'solid',
  cover: 'outline',
  lowCover: 'outline',
  stair: 'outline',
  outskirt: 'dim',
  blockade: 'dim',
}

/**
 * A planta do mapa, uma vez por mapa: o adapter a guarda pelo `arenaId`.
 *
 * ```ts
 * const plan = minimapPlanOf(NEON_KAIDO_LAYOUT)
 * ```
 */
export function minimapPlanOf(
  layout: Pick<ArenaLayout, 'id' | 'blockout' | 'playArea'>,
): MinimapPlan {
  const rects: MinimapRect[] = []
  for (const block of layout.blockout) {
    const style = STYLE_BY_LAYER[block.layer]
    if (!style) continue
    const [cx, , cz] = block.centerM
    const [width, , depth] = block.sizeM
    rects.push({ xM: cx - width / 2, zM: cz - depth / 2, widthM: width, depthM: depth, style })
  }
  return { arenaId: layout.id, rects, playArea: layout.playArea }
}

/** O ponto no minimapa, em pixels do canvas, e se ele ficou preso na borda. */
export interface MinimapPoint {
  readonly x: number
  readonly y: number
  readonly clamped: boolean
}

/**
 * A matriz de canvas (`setTransform(a, b, c, d, e, f)`) que leva a planta, em
 * (x, z) do mundo, ao minimapa girado em volta do jogador. O centro do canvas
 * é o jogador, e o olhar dele aponta para cima.
 */
export type MinimapMatrix = readonly [number, number, number, number, number, number]

/** Quem olha o minimapa: onde está, para onde olha, e o tamanho do disco. */
export interface MinimapFrame {
  readonly selfM: { readonly x: number; readonly y: number; readonly z: number }
  /** O olhar, em mundo; só x e z contam, e não precisa ser unitário. */
  readonly facingM: { readonly x: number; readonly z: number }
  readonly rangeM: number
  readonly radiusPx: number
}

/**
 * A matriz do quadro. O olhar `f` vai para cima e a direita `r = (fz, -fx)`
 * vai para a direita — de mão esquerda, quem olha para +z tem +x à direita.
 *
 * ```ts
 * ctx.setTransform(...minimapMatrixOf(frame))
 * ```
 */
export function minimapMatrixOf(frame: MinimapFrame): MinimapMatrix {
  const { fx, fz } = unitFacingOf(frame.facingM)
  const scale = frame.radiusPx / frame.rangeM
  const { x: sx, z: sz } = frame.selfM
  const rx = fz
  const rz = -fx
  const radius = frame.radiusPx
  return [
    scale * rx,
    -scale * fx,
    scale * rz,
    -scale * fz,
    radius - scale * (rx * sx + rz * sz),
    radius + scale * (fx * sx + fz * sz),
  ]
}

/** O olhar no chão, unitário; o olhar reto para cima ou para baixo vale para +z. */
function unitFacingOf(facing: MinimapFrame['facingM']): { fx: number; fz: number } {
  const length = Math.hypot(facing.x, facing.z)
  if (length < 1e-6) return { fx: 0, fz: 1 }
  return { fx: facing.x / length, fz: facing.z / length }
}

/** A folga da borda, em pixels: o ponto preso fica inteiro dentro do disco. */
const RIM_INSET_PX = 6

/**
 * Um ponto do mundo no minimapa. Além do alcance ele fica preso na borda, na
 * direção certa — o inimigo longe ainda diz de que lado está.
 *
 * ```ts
 * minimapPointOf(matrix, frame, 12, -4) // { x: 140, y: 62, clamped: false }
 * ```
 */
export function minimapPointOf(
  matrix: MinimapMatrix,
  frame: Pick<MinimapFrame, 'radiusPx'>,
  worldX: number,
  worldZ: number,
): MinimapPoint {
  const [a, b, c, d, e, f] = matrix
  const radius = frame.radiusPx
  const dx = a * worldX + c * worldZ + e - radius
  const dy = b * worldX + d * worldZ + f - radius
  const limit = radius - RIM_INSET_PX
  const length = Math.hypot(dx, dy)
  if (length <= limit) return { x: radius + dx, y: radius + dy, clamped: false }
  return { x: radius + (dx / length) * limit, y: radius + (dy / length) * limit, clamped: true }
}

/**
 * Quanto o ponto ainda aparece, de 1 (agora) a 0 (no fim da vida dele).
 *
 * ```ts
 * minimapBlipAlpha(10, 11, 2) // 0.5
 * ```
 */
export function minimapBlipAlpha(seenAtS: number, nowS: number, lifeS: number): number {
  if (lifeS <= 0) return 0
  return Math.min(1, Math.max(0, 1 - (nowS - seenAtS) / lifeS))
}

/** Acima ou abaixo disto o ponto ganha a seta: o inimigo está noutro andar. */
export const MINIMAP_LEVEL_STEP_M = 3

/** O andar do inimigo em relação a quem olha. */
export type MinimapLevel = 'above' | 'level' | 'below'

/**
 * ```ts
 * minimapLevelOf(10, 2) // 'above'
 * ```
 */
export function minimapLevelOf(blipYM: number, selfYM: number): MinimapLevel {
  const rise = blipYM - selfYM
  if (rise > MINIMAP_LEVEL_STEP_M) return 'above'
  if (rise < -MINIMAP_LEVEL_STEP_M) return 'below'
  return 'level'
}

/**
 * De onde o ponto veio: a varredura do PING ou do SONAR, o tiro de alguém, ou
 * o alvo do ECO — este segue o inimigo ao vivo e tem desenho próprio.
 */
export type MinimapBlipKind = 'sweep' | 'shot' | 'echo'

/** Um ponto como a tela o recebe: onde estava, quando foi visto, e quanto dura. */
export interface MinimapBlipView {
  readonly xM: number
  readonly yM: number
  readonly zM: number
  readonly seenAtS: number
  readonly lifeS: number
  readonly kind: MinimapBlipKind
}

/** Tudo o que o minimapa desenha num quadro. */
export interface MinimapView extends MinimapFrame {
  readonly arenaId: string
  readonly nowS: number
  readonly blips: readonly MinimapBlipView[]
  /** O radar embaralhado pelo CONTRA-PING de outro: é ruído, e só a seta fica. */
  readonly jammed: boolean
  /** O PING do jogador está varrendo: a borda acende. */
  readonly pinging: boolean
}

export type MinimapOp =
  | { readonly kind: 'disc'; readonly pinging: boolean }
  | { readonly kind: 'plan'; readonly arenaId: string; readonly matrix: MinimapMatrix }
  | {
      readonly kind: 'blip'
      readonly x: number
      readonly y: number
      readonly alpha: number
      readonly clamped: boolean
      readonly level: MinimapLevel
      readonly tone: MinimapBlipKind
    }
  | { readonly kind: 'noise' }
  | { readonly kind: 'arrow' }

/**
 * As operações do quadro, de baixo para cima: o disco, a planta girada, os
 * pontos e a seta do jogador. Embaralhado, a planta e os pontos dão lugar ao
 * ruído — saber onde se está não é informação do radar, e a seta fica.
 *
 * ```ts
 * for (const op of minimapOpsOf(view)) paint(ctx, op)
 * ```
 */
export function minimapOpsOf(view: MinimapView): MinimapOp[] {
  const ops: MinimapOp[] = [{ kind: 'disc', pinging: view.pinging }]
  if (view.jammed) {
    ops.push({ kind: 'noise' }, { kind: 'arrow' })
    return ops
  }
  const matrix = minimapMatrixOf(view)
  ops.push({ kind: 'plan', arenaId: view.arenaId, matrix })
  for (const blip of view.blips) {
    const alpha = minimapBlipAlpha(blip.seenAtS, view.nowS, blip.lifeS)
    if (alpha <= 0) continue
    const point = minimapPointOf(matrix, view, blip.xM, blip.zM)
    const level = minimapLevelOf(blip.yM, view.selfM.y)
    ops.push({ kind: 'blip', ...point, alpha, level, tone: blip.kind })
  }
  ops.push({ kind: 'arrow' })
  return ops
}

/** A barra do PING embaixo do minimapa: quanto falta, em fração e em texto. */
export interface PingBar {
  readonly fraction: number
  readonly text: string
}

/**
 * A barra do PING, ou `undefined` sem PING no ar.
 *
 * ```ts
 * pingBarOf(11.2, 15) // { fraction: 0.746…, text: 'PING 12s' }
 * ```
 */
export function pingBarOf(pulseLeftS: number, durationS: number): PingBar | undefined {
  if (pulseLeftS <= 0 || durationS <= 0) return undefined
  const fraction = Math.min(1, pulseLeftS / durationS)
  return { fraction, text: `PING ${Math.ceil(pulseLeftS)}s` }
}
