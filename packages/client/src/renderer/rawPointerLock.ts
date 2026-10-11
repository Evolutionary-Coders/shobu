/** O pedaço do canvas que a trava usa. Estrutural: o teste roda em node, com uma trava de mentira. */
export interface PointerLockTarget {
  requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void
}

/**
 * Trava o ponteiro **sem a aceleração do sistema operacional**: o
 * `movementX/Y` chega cru, e o mesmo gesto de mouse vira sempre o mesmo giro
 * de mira — num sniper, mira que depende da velocidade do gesto é mira
 * inconsistente.
 *
 * O navegador que não sabe ler o mouse cru recusa com `NotSupportedError`
 * (chrome em parte do linux); aí a trava simples entra, com aceleração. O
 * firefox ignora a opção e trava do jeito dele. Qualquer outra recusa — fora
 * de gesto, aba escondida — sobe para quem chamou, como antes.
 *
 * ```ts
 * await requestRawPointerLock(canvas)
 * ```
 */
export async function requestRawPointerLock(target: PointerLockTarget): Promise<void> {
  try {
    await target.requestPointerLock({ unadjustedMovement: true })
  } catch (reason) {
    if (!isUnsupported(reason)) throw reason
    console.warn(JSON.stringify({ event: 'raw-pointer-lock-unsupported' }))
    await target.requestPointerLock()
  }
}

function isUnsupported(reason: unknown): boolean {
  return reason instanceof Error && reason.name === 'NotSupportedError'
}
