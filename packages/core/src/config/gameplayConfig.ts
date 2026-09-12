/**
 * Os números de gameplay do shōbu, lidos de `config/gameplay.json` em tempo de
 * execução e passados ao núcleo por parâmetro (ADR 0005). Nenhum deles é
 * literal no código, e todo nome carrega a unidade no sufixo: `Mps` é m/s,
 * `Mps2` é m/s² (aceleração, nunca taxa de decaimento), `S` é segundo,
 * `M` é metro, `Deg` é grau, `Hz` é hertz.
 *
 * Os valores atuais são de ordem de grandeza, escolhidos para o protótipo
 * rodar. A primeira sessão de playtest reescreve todos — a ADR 0005 fixa a
 * lista de chaves, não os valores.
 */

/** Taxas fixadas pela ADR 0002, repetidas aqui porque o núcleo as consome. */
export interface SimulationConfig {
  readonly tickHz: number
  readonly snapshotHz: number
  readonly inputSendHz: number
}

export interface MovementConfig {
  readonly gravityMps2: number
  readonly runSpeedMps: number
  /** Corrida tática, com shift: acima da corrida base, e só enquanto a tecla está presa. */
  readonly sprintSpeedMps: number
  /** Agachado. Abaixo da corrida, e é escolha do jogador, como mirar. */
  readonly crouchSpeedMps: number
  readonly groundAccelerationMps2: number
  readonly groundFrictionMps2: number
  readonly airAccelerationMps2: number
  readonly airSpeedCapMps: number
  readonly jumpImpulseMps: number
  readonly doubleJumpImpulseMps: number
  readonly slideImpulseMps: number
  readonly slideDurationS: number
  readonly slideCancelWindowS: number
  /** Conta do **fim** do slide, não da entrada (modelo de simulação). */
  readonly slideCooldownS: number
}

export interface GrappleConfig {
  readonly maxRangeM: number
  readonly pullAccelerationMps2: number
  readonly maxPullSpeedMps: number
  readonly cooldownS: number
}

export interface CollisionConfig {
  readonly capsuleRadiusM: number
  readonly capsuleHeightM: number
  readonly subStepMaxDisplacementM: number
  readonly stepHeightM: number
  readonly maxWalkableSlopeDeg: number
}

export interface CameraConfig {
  readonly baseFovDeg: number
  readonly scopedFovDeg: number
  readonly scopeTransitionS: number
}

export interface WeaponConfig {
  readonly hitscanRangeM: number
  readonly boltCycleS: number
  readonly noScopeSpreadDeg: number
  readonly scopedMoveSpeedMps: number
  /** Tiros no pente. O gdd dizia "sem pente"; a decisão de 12/09 é 5 balas com recarga. */
  readonly magazineRounds: number
  /** Maior que `boltCycleS`, senão recarregar cedo seria de graça. */
  readonly reloadS: number
  /**
   * Quanto tempo de mira o disparo exige para ser exato. **Menor** que
   * `camera.scopeTransitionS`: é o quick scope do modelo de simulação, onde a
   * precisão total chega antes de o zoom terminar. São dois relógios de
   * propósito — este é simulação, o outro é render.
   */
  readonly scopeSettleS: number
  /** Quanto o rastro do tiro fica visível. É informação de gameplay, não enfeite. */
  readonly tracerLifetimeS: number
}

export interface MatchConfig {
  readonly durationS: number
  readonly respawnDelayS: number
  readonly playersPerRoom: number
  /** Pontos por kill. O gdd diz 1; a proposta de medalhas subiria sem build (ADR 0005). */
  readonly pointsPerKill: number
  /** Quantos postes do campo de treino recebem boneco. 0 desliga o campo. */
  readonly trainingDummies: number
}

export interface GameplayConfig {
  readonly simulation: SimulationConfig
  readonly movement: MovementConfig
  readonly grapple: GrappleConfig
  readonly collision: CollisionConfig
  readonly camera: CameraConfig
  readonly weapon: WeaponConfig
  readonly match: MatchConfig
}
