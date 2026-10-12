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

/**
 * As faixas de um nível de dificuldade. Os três níveis têm as mesmas chaves e
 * as mesmas faixas, então a tabela é gerada: três cópias à mão seriam três
 * lugares para uma faixa divergir.
 */
function botSkillSpec(section: keyof GameplayConfig): readonly NumericFieldSpec[] {
  return [
    // um bot que reage em 0 s é um aimbot; acima de 3 s ele é mobília.
    { section, key: 'reactionS', minInclusive: 0, maxInclusive: 3 },
    { section, key: 'reactionSpreadS', minInclusive: 0, maxInclusive: 3 },
    { section, key: 'aimErrorDeg', minInclusive: 0, maxInclusive: 45 },
    // a ordem entre os dois erros é relação, não faixa: quem a tranca é o teste
    // de `parseGameplayConfig`.
    { section, key: 'aimResidualDeg', minInclusive: 0, maxInclusive: 20 },
    { section, key: 'aimSettleS', minInclusive: 0.05, maxInclusive: 10 },
    { section, key: 'trackingLagS', minInclusive: 0, maxInclusive: 2 },
    { section, key: 'movingErrorDeg', minInclusive: 0, maxInclusive: 20 },
    { section, key: 'airborneErrorDeg', minInclusive: 0, maxInclusive: 45 },
    { section, key: 'flinchErrorDeg', minInclusive: 0, maxInclusive: 45 },
    { section, key: 'meleeReactionS', minInclusive: 0, maxInclusive: 3 },
  ]
}

export const GAMEPLAY_CONFIG_SPEC: readonly NumericFieldSpec[] = [
  { section: 'simulation', key: 'tickHz', minInclusive: 20, maxInclusive: 240 },
  { section: 'simulation', key: 'snapshotHz', minInclusive: 10, maxInclusive: 120 },
  { section: 'simulation', key: 'inputSendHz', minInclusive: 20, maxInclusive: 240 },

  { section: 'movement', key: 'gravityMps2', minInclusive: -60, maxInclusive: -1 },
  { section: 'movement', key: 'runSpeedMps', minInclusive: 1, maxInclusive: 40 },
  { section: 'movement', key: 'sprintSpeedMps', minInclusive: 1, maxInclusive: 40 },
  { section: 'movement', key: 'crouchSpeedMps', minInclusive: 0.5, maxInclusive: 40 },
  { section: 'movement', key: 'groundAccelerationMps2', minInclusive: 1, maxInclusive: 500 },
  { section: 'movement', key: 'groundFrictionMps2', minInclusive: 0, maxInclusive: 500 },
  { section: 'movement', key: 'airAccelerationMps2', minInclusive: 0, maxInclusive: 500 },
  { section: 'movement', key: 'airSpeedCapMps', minInclusive: 1, maxInclusive: 100 },
  { section: 'movement', key: 'jumpImpulseMps', minInclusive: 1, maxInclusive: 40 },
  { section: 'movement', key: 'doubleJumpImpulseMps', minInclusive: 1, maxInclusive: 40 },
  { section: 'movement', key: 'slideImpulseMps', minInclusive: 0, maxInclusive: 40 },
  { section: 'movement', key: 'slideDurationS', minInclusive: 0.05, maxInclusive: 5 },
  { section: 'movement', key: 'slideCancelWindowS', minInclusive: 0.01, maxInclusive: 2 },
  { section: 'movement', key: 'slideCooldownS', minInclusive: 0, maxInclusive: 10 },
  { section: 'movement', key: 'tacticalSprintSpeedMps', minInclusive: 1, maxInclusive: 40 },
  // abaixo de meio segundo a corrida tática plena não chega a acelerar.
  { section: 'movement', key: 'tacticalSprintTankS', minInclusive: 0.5, maxInclusive: 30 },
  { section: 'movement', key: 'tacticalSprintRechargeDelayS', minInclusive: 0, maxInclusive: 30 },
  { section: 'movement', key: 'tacticalSprintRefillS', minInclusive: 0.1, maxInclusive: 60 },
  // acima de um segundo, dois apertos soltos viram corrida tática sem o jogador pedir.
  { section: 'movement', key: 'sprintDoubleTapS', minInclusive: 0.05, maxInclusive: 1 },

  { section: 'grapple', key: 'maxRangeM', minInclusive: 1, maxInclusive: 200 },
  { section: 'grapple', key: 'pullAccelerationMps2', minInclusive: 1, maxInclusive: 500 },
  { section: 'grapple', key: 'maxPullSpeedMps', minInclusive: 1, maxInclusive: 100 },
  { section: 'grapple', key: 'cooldownS', minInclusive: 0, maxInclusive: 30 },
  { section: 'grapple', key: 'minRopeLengthM', minInclusive: 0.5, maxInclusive: 20 },
  { section: 'grapple', key: 'maxAttachedS', minInclusive: 0.2, maxInclusive: 20 },
  { section: 'grapple', key: 'missCooldownS', minInclusive: 0, maxInclusive: 10 },
  { section: 'grapple', key: 'swingAccelerationMps2', minInclusive: 0, maxInclusive: 200 },
  { section: 'grapple', key: 'releaseJumpImpulseMps', minInclusive: 1, maxInclusive: 40 },

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
  // 30 no teto porque é pente, não cinto de munição.
  { section: 'weapon', key: 'magazineRounds', minInclusive: 1, maxInclusive: 30 },
  { section: 'weapon', key: 'reloadS', minInclusive: 0.1, maxInclusive: 10 },
  // 0 é legítimo e quer dizer "quick scope de graça".
  { section: 'weapon', key: 'scopeSettleS', minInclusive: 0, maxInclusive: 2 },
  { section: 'weapon', key: 'tracerLifetimeS', minInclusive: 0.02, maxInclusive: 2 },
  // 0 é legítimo: correr e atirar no mesmo tick, como antes do sprint-to-fire.
  { section: 'weapon', key: 'sprintToFireS', minInclusive: 0, maxInclusive: 1 },
  { section: 'weapon', key: 'tacticalSprintToFireS', minInclusive: 0, maxInclusive: 1 },

  // o alcance do corpo a corpo é curto por definição: acima de 6 m a faca
  // competiria com a sniper no meio da rua.
  { section: 'melee', key: 'knifeReachM', minInclusive: 0.5, maxInclusive: 6 },
  { section: 'melee', key: 'knifeArcDeg', minInclusive: 5, maxInclusive: 90 },
  { section: 'melee', key: 'knifeCooldownS', minInclusive: 0.05, maxInclusive: 5 },
  { section: 'melee', key: 'katanaReachM', minInclusive: 0.5, maxInclusive: 6 },
  { section: 'melee', key: 'katanaArcDeg', minInclusive: 5, maxInclusive: 90 },
  { section: 'melee', key: 'katanaSlashCooldownS', minInclusive: 0.05, maxInclusive: 5 },
  { section: 'melee', key: 'katanaQuickCooldownS', minInclusive: 0.05, maxInclusive: 5 },
  // o teto é o de um toque que ainda parece toque.
  { section: 'melee', key: 'holdToDrawS', minInclusive: 0.1, maxInclusive: 1 },
  { section: 'melee', key: 'katanaDrawS', minInclusive: 0, maxInclusive: 2 },
  { section: 'melee', key: 'knifeDrawS', minInclusive: 0, maxInclusive: 2 },
  { section: 'melee', key: 'sniperRaiseS', minInclusive: 0, maxInclusive: 2 },
  { section: 'melee', key: 'bladeSpeedBonusMps', minInclusive: 0, maxInclusive: 5 },
  { section: 'melee', key: 'dashSpeedMps', minInclusive: 1, maxInclusive: 40 },
  { section: 'melee', key: 'dashCooldownS', minInclusive: 0.1, maxInclusive: 30 },

  { section: 'match', key: 'durationS', minInclusive: 30, maxInclusive: 3600 },
  { section: 'match', key: 'respawnDelayS', minInclusive: 0, maxInclusive: 30 },
  { section: 'match', key: 'playersPerRoom', minInclusive: 2, maxInclusive: 32 },
  { section: 'match', key: 'pointsPerKill', minInclusive: 1, maxInclusive: 100 },
  // abaixo de 1 s o aviso some antes de ser lido; acima de 30 s sair do mapa
  // vira esconderijo.
  { section: 'match', key: 'outOfBoundsGraceS', minInclusive: 1, maxInclusive: 30 },

  // a escada de multikill tem que ser estritamente crescente; a faixa é só
  // sanidade, e quem tranca a ordem é `awardMedals.test.ts`.
  { section: 'medals', key: 'bonusComum', minInclusive: 0, maxInclusive: 1000 },
  { section: 'medals', key: 'bonusIncomum', minInclusive: 0, maxInclusive: 1000 },
  { section: 'medals', key: 'bonusRara', minInclusive: 0, maxInclusive: 1000 },
  { section: 'medals', key: 'bonusLendaria', minInclusive: 0, maxInclusive: 1000 },
  { section: 'medals', key: 'bonusKillChain', minInclusive: 0, maxInclusive: 1000 },
  { section: 'medals', key: 'doubleKillWindowS', minInclusive: 0.5, maxInclusive: 60 },
  { section: 'medals', key: 'tripleKillWindowS', minInclusive: 0.5, maxInclusive: 60 },
  { section: 'medals', key: 'overkillWindowS', minInclusive: 0.5, maxInclusive: 60 },
  { section: 'medals', key: 'killChainWindowS', minInclusive: 0.5, maxInclusive: 60 },
  // o piso é o alcance do gancho: abaixo dele "tiro longo" seria um engate.
  { section: 'medals', key: 'longshotM', minInclusive: 45, maxInclusive: 400 },
  { section: 'medals', key: 'spinDeg', minInclusive: 90, maxInclusive: 1440 },
  { section: 'medals', key: 'buzzkillStreak', minInclusive: 2, maxInclusive: 50 },
  // 0,5 é a cintura; abaixo disso `headshot` deixaria de premiar precisão.
  { section: 'medals', key: 'headshotHeightRatio', minInclusive: 0.5, maxInclusive: 1 },
  { section: 'medals', key: 'backstabAngleDeg', minInclusive: 90, maxInclusive: 180 },

  { section: 'bots', key: 'sightRangeM', minInclusive: 5, maxInclusive: 400 },
  { section: 'bots', key: 'scopeBeyondM', minInclusive: 0, maxInclusive: 400 },
  { section: 'bots', key: 'stuckAfterS', minInclusive: 0.2, maxInclusive: 10 },
  { section: 'bots', key: 'strafeSwitchS', minInclusive: 0.2, maxInclusive: 10 },
  { section: 'bots', key: 'nearMissM', minInclusive: 0, maxInclusive: 10 },
  { section: 'bots', key: 'flinchS', minInclusive: 0, maxInclusive: 5 },

  ...botSkillSpec('botSkillEasy'),
  ...botSkillSpec('botSkillNormal'),
  ...botSkillSpec('botSkillHard'),
]
