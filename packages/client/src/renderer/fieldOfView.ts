/**
 * Converte o fov horizontal, que é como jogador de fps fala de fov, no fov
 * vertical que a câmera consome. Sem a conversão, o mesmo número dá
 * enquadramento diferente em cada proporção de tela.
 *
 * Trigonometria aqui é legítima: isto é render, não simulação — a proibição de
 * `Math.tan` da ADR 0003 vale para o caminho determinístico.
 *
 * ```ts
 * camera.fov = verticalFovRad(103, 16 / 9) // ≈ 1.29 rad
 * ```
 */
export function verticalFovRad(horizontalFovDeg: number, aspectRatio: number): number {
  if (horizontalFovDeg <= 0 || horizontalFovDeg >= 180) {
    throw new RangeError(`horizontalFovDeg recebeu ${horizontalFovDeg}; esperado entre 0 e 180`)
  }
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError(`aspectRatio recebeu ${aspectRatio}; esperado número finito > 0`)
  }
  const halfHorizontalRad = (horizontalFovDeg * Math.PI) / 360
  return 2 * Math.atan(Math.tan(halfHorizontalRad) / aspectRatio)
}
