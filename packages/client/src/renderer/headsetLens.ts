/**
 * A luneta dentro do óculos. O rig vr do babylon ignora `camera.fov`: a abertura
 * de cada olho sai dos parâmetros da lente, por 2·atan(k / 2d), onde d é a
 * distância do olho à tela. Ampliar m vezes é, então, afastar a tela m vezes.
 *
 * E a ampliação tem teto. Com o mouse, o 7× da luneta multiplica um gesto que o
 * jogador controla; no óculos, multiplica o tremor da cabeça, que ele não
 * controla, e uma mira que treme 7× é mira que ninguém acerta (ADR 0012).
 */

/** O teto da ampliação no óculos. A luneta do desktop vai a ~7×. */
export const HEADSET_MAX_MAGNIFICATION = 3

/**
 * Quantas vezes a vista está ampliada, dos dois fovs horizontais da luneta, com
 * o teto do óculos. Nunca abaixo de 1: a lente de entrada abre o fov além da
 * base por um instante, e no óculos isso não se faz.
 *
 * ```ts
 * headsetMagnification(90, 90) // 1: sem luneta
 * headsetMagnification(90, 15) // 3: a luneta, no teto
 * ```
 */
export function headsetMagnification(baseFovDeg: number, currentFovDeg: number): number {
  const ratio = halfTan(baseFovDeg) / halfTan(currentFovDeg)
  return Math.min(HEADSET_MAX_MAGNIFICATION, Math.max(1, ratio))
}

/**
 * A distância do olho à tela que dá a ampliação pedida, a partir da de fábrica
 * da lente.
 *
 * ```ts
 * eyeToScreenFor(0.041, 2) // 0.082: a mesma tela, metade da abertura
 * ```
 */
export function eyeToScreenFor(baseEyeToScreenM: number, magnification: number): number {
  return baseEyeToScreenM * magnification
}

function halfTan(fovDeg: number): number {
  return Math.tan((fovDeg * Math.PI) / 360)
}
