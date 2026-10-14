import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'
import type { StickTurn } from './stickLook.ts'

/**
 * O ganho do arrasto de mira. O do mouse entra inteiro, luneta incluída, e a
 * preferência do toque **troca** a do mouse, como no analógico
 * (`stickLook.ts`): o mesmo jogador usa o mouse no computador da feira e o
 * dedo no próprio celular, e um não pode puxar o outro.
 */
export interface TouchLookGain {
  /** O ganho do mouse agora, em pixels por radiano: maior é mais lento. */
  readonly pixelsPerRadian: number
  /** O multiplicador do mouse que já está dentro de `pixelsPerRadian`. */
  readonly mouseSensitivity: number
  readonly touchSensitivity: number
}

/**
 * O giro de um arrasto, em radianos. Arrastar para cima olha para cima, como
 * arrastar a tela de um mapa: o dedo puxa a vista.
 *
 * ```ts
 * touchLookTurn({ x: 200, y: 0 }, { pixelsPerRadian: 200, mouseSensitivity: 1, touchSensitivity: 1 }, turn)
 * // turn.y = 1: um radiano para a direita
 * ```
 */
export function touchLookTurn(
  dragPx: Readonly<{ x: number; y: number }>,
  gain: TouchLookGain,
  into: StickTurn,
): StickTurn {
  const radiansPerPx = gain.touchSensitivity / gain.mouseSensitivity / gain.pixelsPerRadian
  into.x = dragPx.y * radiansPerPx
  into.y = dragPx.x * radiansPerPx
  return into
}

/**
 * ```ts
 * touchGainFrom(settings, look.angularSensibility, gain) // reescreve `gain`
 * ```
 */
export function touchGainFrom(
  settings: Readonly<PlayerSettings>,
  pixelsPerRadian: number,
  into: MutableTouchLookGain = { pixelsPerRadian: 0, mouseSensitivity: 1, touchSensitivity: 1 },
): TouchLookGain {
  into.pixelsPerRadian = pixelsPerRadian
  into.mouseSensitivity = settings.mouseSensitivity
  into.touchSensitivity = settings.touchSensitivity
  return into
}

/** O ganho reaproveitado de quadro em quadro: o laço de toque não aloca. */
export type MutableTouchLookGain = { -readonly [Key in keyof TouchLookGain]: TouchLookGain[Key] }
