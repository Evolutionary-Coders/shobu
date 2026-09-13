/**
 * Tangente do semi-ângulo de dispersão.
 *
 * **A única exceção de trigonometria declarada do núcleo** (ver
 * `coreIsDeterministic.test.ts`). `Math.tan` pode diferir no último bit entre
 * motores, e cliente e servidor têm que chegar ao mesmo cone a partir do mesmo
 * `config/gameplay.json`, senão o cliente vê um acerto que o servidor recusa.
 *
 * Duas coisas tornam a exceção segura, e são as que a ADR 0003 prevê para onde
 * a trigonometria for inevitável:
 *
 * - **arredondar**: 1e-6 em tangente é 6e-5 grau, muito abaixo do perceptível,
 *   e idêntico em qualquer build.
 * - **sair do caminho quente**: isto é chamado **uma vez por carga de
 *   configuração**, nunca por tick e nunca por tiro. A amostragem do cone em
 *   si — `aimSpread.ts` — não usa trigonometria nenhuma.
 *
 * ```ts
 * spreadTangent(4.5) // 0.078702
 * ```
 */
const TANGENT_QUANTUM = 1e-6

export function spreadTangent(semiAngleDeg: number): number {
  if (!Number.isFinite(semiAngleDeg) || semiAngleDeg < 0 || semiAngleDeg >= 90) {
    throw new RangeError(`semiAngleDeg recebeu ${semiAngleDeg}; esperado número de 0 a 90`)
  }
  if (semiAngleDeg === 0) return 0
  const exact = Math.tan((semiAngleDeg * Math.PI) / 180)
  return Math.round(exact / TANGENT_QUANTUM) * TANGENT_QUANTUM
}
