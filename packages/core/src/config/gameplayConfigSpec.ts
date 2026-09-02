import type { GameplayConfig } from './gameplayConfig.ts'

/**
 * Faixa aceitável de cada número de gameplay. O parser rejeita valor fora da
 * faixa, chave desconhecida e chave ausente (ADR 0005): chave renomeada em
 * silêncio é o defeito que a validação existe para pegar.
 *
 * A faixa é sanidade, não balanceamento — ela só descarta o que é erro de
 * digitação ou de unidade.
 */
export interface NumericFieldSpec {
  readonly section: keyof GameplayConfig
  readonly key: string
  readonly minInclusive: number
  readonly maxInclusive: number
}

export const GAMEPLAY_CONFIG_SPEC: readonly NumericFieldSpec[] = [
  { section: 'simulation', key: 'tickHz', minInclusive: 20, maxInclusive: 240 },
  { section: 'simulation', key: 'snapshotHz', minInclusive: 10, maxInclusive: 120 },
  { section: 'simulation', key: 'inputSendHz', minInclusive: 20, maxInclusive: 240 },

  { section: 'movement', key: 'gravityMps2', minInclusive: -60, maxInclusive: -1 },
  { section: 'movement', key: 'runSpeedMps', minInclusive: 1, maxInclusive: 40 },
  { section: 'movement', key: 'groundAccelerationMps2', minInclusive: 1, maxInclusive: 500 },
  { section: 'movement', key: 'groundFrictionMps2', minInclusive: 0, maxInclusive: 500 },
  { section: 'movement', key: 'airAccelerationMps2', minInclusive: 0, maxInclusive: 500 },
  { section: 'movement', key: 'airSpeedCapMps', minInclusive: 1, maxInclusive: 100 },
  { section: 'movement', key: 'jumpImpulseMps', minInclusive: 1, maxInclusive: 40 },
  { section: 'movement', key: 'doubleJumpImpulseMps', minInclusive: 1, maxInclusive: 40 },
  { section: 'movement', key: 'slideImpulseMps', minInclusive: 0, maxInclusive: 40 },
  { section: 'movement', key: 'slideDurationS', minInclusive: 0.05, maxInclusive: 5 },
  { section: 'movement', key: 'slideCancelWindowS', minInclusive: 0.01, maxInclusive: 2 },

  { section: 'grapple', key: 'maxRangeM', minInclusive: 1, maxInclusive: 200 },
  { section: 'grapple', key: 'pullAccelerationMps2', minInclusive: 1, maxInclusive: 500 },
  { section: 'grapple', key: 'maxPullSpeedMps', minInclusive: 1, maxInclusive: 100 },
  { section: 'grapple', key: 'cooldownS', minInclusive: 0, maxInclusive: 30 },

  { section: 'collision', key: 'capsuleRadiusM', minInclusive: 0.05, maxInclusive: 2 },
  { section: 'collision', key: 'capsuleHeightM', minInclusive: 0.5, maxInclusive: 4 },
  { section: 'collision', key: 'subStepMaxDisplacementM', minInclusive: 0.01, maxInclusive: 1 },
  { section: 'collision', key: 'stepHeightM', minInclusive: 0, maxInclusive: 2 },
  { section: 'collision', key: 'maxWalkableSlopeDeg', minInclusive: 0, maxInclusive: 89 },

  { section: 'camera', key: 'baseFovDeg', minInclusive: 60, maxInclusive: 140 },
  { section: 'camera', key: 'scopedFovDeg', minInclusive: 5, maxInclusive: 90 },
  { section: 'camera', key: 'scopeTransitionS', minInclusive: 0, maxInclusive: 2 },

  { section: 'weapon', key: 'hitscanRangeM', minInclusive: 1, maxInclusive: 2000 },
  { section: 'weapon', key: 'boltCycleS', minInclusive: 0.05, maxInclusive: 10 },
  { section: 'weapon', key: 'noScopeSpreadDeg', minInclusive: 0, maxInclusive: 45 },
  { section: 'weapon', key: 'scopedMoveSpeedMps', minInclusive: 0.1, maxInclusive: 40 },

  { section: 'match', key: 'durationS', minInclusive: 30, maxInclusive: 3600 },
  { section: 'match', key: 'respawnDelayS', minInclusive: 0, maxInclusive: 30 },
  { section: 'match', key: 'playersPerRoom', minInclusive: 2, maxInclusive: 32 },
]
