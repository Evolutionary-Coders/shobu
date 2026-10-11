import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { MeleeWeapon } from './meleeState.ts'

/** Até onde um golpe chega, e o cosseno mínimo entre a mira e o alvo. */
export interface StrikeReach {
  readonly reachM: number
  readonly minCos: number
}

export type MeleeReach = Readonly<Record<MeleeWeapon, StrikeReach>>

/** O mesmo quantum da tangente da dispersão (`spreadTangent.ts`), pelo mesmo motivo. */
const COSINE_QUANTUM = 1e-6

/**
 * O arco de cada arma em cosseno, **uma vez por carga de configuração**. É a
 * segunda exceção de trigonometria do núcleo (`coreIsDeterministic.test.ts`),
 * segura pelas mesmas duas razões da primeira: o resultado é arredondado a
 * 1e-6, e nunca roda por tick nem por golpe.
 *
 * ```ts
 * const reach = createMeleeReach(config)
 * reach.katana.reachM // 3
 * ```
 */
export function createMeleeReach(config: GameplayConfig): MeleeReach {
  const { melee } = config
  return {
    knife: { reachM: melee.knifeReachM, minCos: arcCosine(melee.knifeArcDeg) },
    katana: { reachM: melee.katanaReachM, minCos: arcCosine(melee.katanaArcDeg) },
  }
}

function arcCosine(semiAngleDeg: number): number {
  const exact = Math.cos((semiAngleDeg * Math.PI) / 180)
  return Math.round(exact / COSINE_QUANTUM) * COSINE_QUANTUM
}
