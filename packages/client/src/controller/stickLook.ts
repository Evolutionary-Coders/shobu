import { BASE_PIXELS_PER_RADIAN } from '../renderer/lookSensitivity.ts'
import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'
import type { HeldStick } from './heldStick.ts'

/**
 * Olhar com o analógico direito de um controle de console. O mouse gira por
 * deslocamento; o analógico, por **velocidade**: inclinado, ele gira enquanto
 * estiver inclinado.
 */

/** O giro de um quadro, em radianos, no formato do `cameraRotation` do babylon. */
export interface StickTurn {
  x: number
  y: number
}

/**
 * Radianos por segundo com o analógico no fim do curso, no ganho de mouse
 * padrão: meia volta em pouco mais de um segundo, que é o que um fps de
 * console costuma dar.
 */
export const STICK_LOOK_MAX_RAD_PER_S = 3

/**
 * O ganho do analógico neste quadro. O do mouse entra inteiro, luneta
 * incluída, e a preferência do controle **troca** a do mouse em vez de somar a
 * ela: quem acelera o mouse não quer o analógico acelerado junto.
 */
export interface StickGain {
  /** O ganho do mouse agora, em pixels por radiano: maior é mais lento. */
  readonly pixelsPerRadian: number
  /** O multiplicador do mouse que já está dentro de `pixelsPerRadian`. */
  readonly mouseSensitivity: number
  readonly stickSensitivity: number
  readonly invertY: boolean
}

/**
 * O giro deste quadro. A resposta é **quadrática**: meio curso gira a um quarto
 * da velocidade, e é isso que dá mira fina de sniper sem tirar a meia-volta
 * rápida do fim do curso.
 *
 * Para cima no analógico é olhar para cima, e no babylon olhar para cima é
 * inclinação negativa — a não ser com o vertical invertido.
 *
 * ```ts
 * stickLookTurn({ ahead: 0, side: 1 }, { pixelsPerRadian: 200, mouseSensitivity: 1, stickSensitivity: 1, invertY: false }, 1 / 60, turn)
 * // turn.y = 0.05: 3 rad/s
 * ```
 */
export function stickLookTurn(
  look: Readonly<HeldStick>,
  gain: StickGain,
  dtS: number,
  into: StickTurn,
): StickTurn {
  const preference = gain.stickSensitivity / gain.mouseSensitivity
  const rate =
    STICK_LOOK_MAX_RAD_PER_S * (BASE_PIXELS_PER_RADIAN / gain.pixelsPerRadian) * preference * dtS
  into.y = curve(look.side) * rate
  into.x = (gain.invertY ? 1 : -1) * curve(look.ahead) * rate
  return into
}

function curve(axis: number): number {
  return axis * Math.abs(axis)
}

/**
 * O ganho do analógico a partir das configurações e do ganho do mouse agora.
 * O analógico escala pela mesma conta do mouse
 * (`lookSensitivity.ts`): a luneta corta os dois igual.
 *
 * ```ts
 * stickGainFrom(settings, look.angularSensibility)
 * ```
 */
export function stickGainFrom(
  settings: Readonly<PlayerSettings>,
  pixelsPerRadian: number,
): StickGain {
  return {
    pixelsPerRadian,
    mouseSensitivity: settings.mouseSensitivity,
    stickSensitivity: settings.stickSensitivity,
    invertY: settings.invertStickY === 1,
  }
}
