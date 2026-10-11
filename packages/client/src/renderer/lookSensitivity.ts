import type { PlayerSettings } from '../settings/playerSettingsSpec.ts'

/**
 * Pixels de mouse por radiano, **antes** da preferência do jogador.
 *
 * É o número que o `firstPersonViewer.ts` escrevia na criação da câmera, e o
 * docblock de lá explica por que é 200 e não os 2000 do babylon: sem inércia, o
 * ganho tem que ser o efetivo. Aqui ele vira a linha de base que a sensibilidade
 * divide.
 */
export const BASE_PIXELS_PER_RADIAN = 200

export interface LookGain {
  /** O fov horizontal **deste quadro**, em graus, já com a luneta contada. */
  readonly currentFovDeg: number
  /** O fov de quadril do jogador, em graus. É o denominador do zoom angular. */
  readonly baseFovDeg: number
  /** 0 fora da luneta, 1 com ela aberta. É o que mistura a sensibilidade da mira. */
  readonly scopeBlend: number
  readonly settings: PlayerSettings
}

/**
 * O zoom angular da mira: `tan(fov/2) / tan(fov_mira/2)`, a fórmula que o
 * `docs/simulation-model.md` já lista.
 *
 * Derivado do fov **deste quadro** e não das duas pontas, e é isso que faz a
 * sensibilidade atravessar a transição da luneta sem degrau: o fov varia
 * continuamente entre 90 e 22, então o coeficiente também. Tirar das pontas
 * daria um salto no instante em que a luneta abre.
 *
 * Devolve 1 no quadril e vai caindo conforme a luneta fecha o campo.
 *
 * ```ts
 * fovLookCoefficient(22, 90) // ≈ 0,20 — a mira anda um quinto do que andava
 * ```
 */
export function fovLookCoefficient(currentFovDeg: number, baseFovDeg: number): number {
  return halfAngleTangent(currentFovDeg) / halfAngleTangent(baseFovDeg)
}

function halfAngleTangent(fovDeg: number): number {
  if (!(fovDeg > 0) || fovDeg >= 180) {
    throw new RangeError(`fovDeg recebeu ${fovDeg}; esperado entre 0 e 180 exclusivos`)
  }
  return Math.tan((fovDeg * Math.PI) / 360)
}

/**
 * O ganho do mouse neste quadro, em pixels por radiano — a unidade que o
 * `camera.angularSensibility` do babylon usa, em que **maior é mais lento**. Por
 * isso a preferência do jogador divide em vez de multiplicar.
 *
 * A conta tem três fatores, e o do meio é o que dá sentido ao ajuste da luneta:
 *
 * 1. `mouseSensitivity` — o multiplicador do jogador, sempre.
 * 2. o **zoom angular**, que compensa o campo fechado. Com ele sozinho,
 *    `scopeSensitivity` em 1,00 quer dizer exatamente "a mesma distância na tela
 *    por centímetro de mouse", com e sem luneta. É a definição que dá para
 *    explicar, e a mesma que counter-strike e valorant chamam de zoom
 *    sensitivity.
 * 3. `scopeSensitivity`, entrando pela rampa da luneta, para quem quiser mira
 *    mais fina lá dentro do que a compensação entrega.
 *
 * ```ts
 * lookPixelsPerRadian({ currentFovDeg: 90, baseFovDeg: 90, scopeBlend: 0, settings })
 * ```
 */
export function lookPixelsPerRadian(gain: LookGain): number {
  const coefficient = fovLookCoefficient(gain.currentFovDeg, gain.baseFovDeg)
  const scoped = 1 + (gain.settings.scopeSensitivity - 1) * clamp01(gain.scopeBlend)
  return BASE_PIXELS_PER_RADIAN / (gain.settings.mouseSensitivity * coefficient * scoped)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
