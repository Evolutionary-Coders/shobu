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
  /**
   * Pontos por kill. 100 é a escala de placar de arena — o número que sobe na
   * tela precisa ter peso, e `+1` não tem. A ordem do placar é a mesma de 1
   * ponto por kill; o que muda é a leitura. A proposta de medalhas soma por
   * cima disto sem build (ADR 0005).
   */
  readonly pointsPerKill: number
  /**
   * Quanto tempo o jogador pode ficar fora da área de jogo antes de morrer e
   * reaparecer num spawn. A arena não é mais fechada por parede, e este é o
   * limite que a substitui: o aviso na tela conta estes segundos.
   */
  readonly outOfBoundsGraceS: number
}

/**
 * Bônus e limiares das medalhas. Todos plano e em número por exigência do
 * parser (ADR 0005), e todos afináveis sem build — é o ponto da
 * [`docs/medals.md`](../../../../docs/medals.md): os valores dela são chute
 * honesto, para serem afinados jogando.
 *
 * A escala é a de `match.pointsPerKill`, que é 100. A lendária vale duas kills
 * e meia, e a escada de multikill é **estritamente crescente** — 50, 100, 250,
 * 400 — porque a família paga só a diferença do degrau anterior, e escada que
 * empata faria a quinta kill de uma sequência valer zero de bônus.
 */
export interface MedalsConfig {
  readonly bonusComum: number
  readonly bonusIncomum: number
  readonly bonusRara: number
  readonly bonusLendaria: number
  /** A única medalha fora do bônus da própria raridade; é o topo da escada. */
  readonly bonusKillChain: number
  readonly doubleKillWindowS: number
  readonly tripleKillWindowS: number
  readonly overkillWindowS: number
  readonly killChainWindowS: number
  /** "Atravessei a arena": acima do alcance do gancho, que é 45 m. */
  readonly longshotM: number
  readonly spinDeg: number
  /** Kills sem morrer que a vítima precisa ter para a kill virar `buzzkill`. */
  readonly buzzkillStreak: number
  /** Terço superior da cápsula, de 0 no pé a 1 no topo. */
  readonly headshotHeightRatio: number
  readonly backstabAngleDeg: number
}

/**
 * Os bots que completam a sala quando falta gente (ADR 0016). Cada número é
 * uma parte da **dificuldade**, e nenhum deles muda regra de jogo: o bot anda
 * com o mesmo `stepCharacter`, atira com a mesma arma e morre do mesmo tiro.
 * O que separa um bot fácil de um difícil é só quanto ele demora para reagir
 * e quanto a mira dele erra.
 */
export interface BotsConfig {
  /** Do primeiro instante em que vê o alvo até poder puxar o gatilho. */
  readonly reactionS: number
  /** O erro da mira no instante em que o alvo aparece, em semi-ângulo. */
  readonly aimErrorDeg: number
  /** O erro que sobra depois de a mira assentar. É o teto de precisão do bot. */
  readonly aimResidualDeg: number
  /** Quanto a mira leva para ir de `aimErrorDeg` a `aimResidualDeg`, em linha reta. */
  readonly aimSettleS: number
  /** Além disto o bot não enxerga ninguém, nem com a linha de visão livre. */
  readonly sightRangeM: number
  /** Acima desta distância o bot abre a luneta antes de atirar. */
  readonly scopeBeyondM: number
  /** Sem chegar mais perto do próximo ponto por este tempo, o bot está preso. */
  readonly stuckAfterS: number
  /** Quanto dura cada lado do passo lateral de quem troca tiro. */
  readonly strafeSwitchS: number
}

export interface GameplayConfig {
  readonly simulation: SimulationConfig
  readonly movement: MovementConfig
  readonly grapple: GrappleConfig
  readonly collision: CollisionConfig
  readonly camera: CameraConfig
  readonly weapon: WeaponConfig
  readonly match: MatchConfig
  readonly medals: MedalsConfig
  readonly bots: BotsConfig
}
