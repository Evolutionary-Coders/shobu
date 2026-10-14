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
  /**
   * Corrida tática plena, o shift duplo do warzone: acima da corrida tática, e
   * só enquanto o tanque `tacticalSprintTankS` dura.
   */
  readonly tacticalSprintSpeedMps: number
  /** Quanto a corrida tática plena dura, de tanque cheio. */
  readonly tacticalSprintTankS: number
  /** Fora da corrida tática plena, quanto o tanque espera antes de começar a encher. */
  readonly tacticalSprintRechargeDelayS: number
  /** Do vazio ao cheio, depois da espera. */
  readonly tacticalSprintRefillS: number
  /** Dois apertos do shift dentro disto viram a corrida tática plena. */
  readonly sprintDoubleTapS: number
}

/**
 * O gancho (`movement/grapple.ts`): uma corda que puxa e balança. A semântica
 * de cada número está no modelo de simulação, seção "gancho".
 */
export interface GrappleConfig {
  /** Até onde o cabo alcança, do olho. As medalhas medem "tiro longo" contra ele. */
  readonly maxRangeM: number
  /** O puxão do carretel, ao longo da corda, enquanto ela está acima do mínimo. */
  readonly pullAccelerationMps2: number
  /** Teto da velocidade **inteira** enquanto engatado: puxão e queda somados. */
  readonly maxPullSpeedMps: number
  /** Conta da **soltura**, não do disparo — como o slide (modelo de simulação). */
  readonly cooldownS: number
  /** Abaixo disto o carretel para e a corda vira pêndulo; é também o engate mais curto. */
  readonly minRopeLengthM: number
  /** Teto de tempo engatado: corta a corda se a geometria prender o jogador no ar. */
  readonly maxAttachedS: number
  /** O custo de disparar no vazio: curto, só para o botão não virar metralhadora. */
  readonly missCooldownS: number
  /** O controle no ar pendurado: empurra o balanço, não voa. */
  readonly swingAccelerationMps2: number
  /**
   * Pular para soltar. Maior que `movement.jumpImpulseMps`: é o que tira da
   * quina quem o carretel deixou pendurado embaixo dela, já que o jogo não tem
   * escalada de borda.
   */
  readonly releaseJumpImpulseMps: number
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
  /**
   * O sprint-to-fire: correndo, a arma está abaixada, e o tiro ou a mira pedidos
   * saem depois disto. É o custo de correr, e o que impede correr e atirar no
   * mesmo instante.
   */
  readonly sprintToFireS: number
  /** O mesmo, saindo da corrida tática plena: a arma está erguida no ombro, mais longe da mira. */
  readonly tacticalSprintToFireS: number
}

/**
 * O corpo a corpo (`melee/`, ADR 0021): a faca e a katana, as duas com golpe
 * rápido no toque e empunhadas segurando a tecla. Alcance medido do olho até a cápsula da
 * vítima; arco é o **semi-ângulo** do cone à frente da mira.
 */
export interface MeleeConfig {
  readonly knifeReachM: number
  readonly knifeArcDeg: number
  readonly knifeCooldownS: number
  readonly katanaReachM: number
  readonly katanaArcDeg: number
  /** Entre dois cortes com a katana na mão. */
  readonly katanaSlashCooldownS: number
  /** Depois do golpe rápido de katana, com a sniper na mão: a lâmina sai e volta. */
  readonly katanaQuickCooldownS: number
  /** Segurar a tecla por isto empunha (ou guarda) a lâmina; soltar antes é golpe rápido. */
  readonly holdToDrawS: number
  /** Sacar a katana: até terminar, ela não corta. */
  readonly katanaDrawS: number
  /** Sacar a faca: mais curto que a katana, a lâmina é menor. */
  readonly knifeDrawS: number
  /** Voltar à sniper: até terminar, ela não atira nem mira (o pedido fica guardado). */
  readonly sniperRaiseS: number
  /**
   * Multiplica a velocidade de **toda** marcha no chão — agachado, corrida, corrida tática e
   * plena — com a katana empunhada, e o impulso do slide: ela pesa menos que a sniper.
   */
  readonly katanaSpeedScale: number
  /** O mesmo, com a faca empunhada: mais leve que a katana, mais rápida que ela. */
  readonly knifeSpeedScale: number
  /** A velocidade horizontal que a investida impõe, só no chão. O atrito do chão a desfaz. */
  readonly dashSpeedMps: number
  readonly dashCooldownS: number
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
 * Os bots que completam a sala quando falta gente (ADR 0016): o que vale para
 * qualquer dificuldade — o que eles enxergam, como andam, e o que conta como
 * tiro passando perto. Nenhum número aqui muda regra de jogo: o bot anda com o
 * mesmo `stepCharacter`, atira com a mesma arma e morre do mesmo tiro.
 *
 * A **dificuldade** mora à parte, num `BotSkillConfig` por nível.
 */
export interface BotsConfig {
  /** Além disto o bot não enxerga ninguém, nem com a linha de visão livre. */
  readonly sightRangeM: number
  /** Acima desta distância o bot abre a luneta antes de atirar. */
  readonly scopeBeyondM: number
  /** Sem chegar mais perto do próximo ponto por este tempo, o bot está preso. */
  readonly stuckAfterS: number
  /** Quanto dura cada lado do passo lateral de quem troca tiro. */
  readonly strafeSwitchS: number
  /** Tiro que passa a menos disto do peito do bot é quase-tiro: ele se assusta e procura quem foi. */
  readonly nearMissM: number
  /** Quanto dura o susto do quase-tiro, com a mira tremida. */
  readonly flinchS: number
}

/**
 * Um nível de dificuldade dos bots: só quanto ele demora para reagir e quanto
 * a mira dele erra. Os três níveis (`botSkillEasy`, `botSkillNormal`,
 * `botSkillHard`) têm as mesmas chaves, e o jogador escolhe no menu.
 *
 * O erro de um tiro é a **soma** das parcelas abaixo, sorteada de novo a cada
 * tiro (`botAim.ts`): nenhuma delas converge para zero, e por isso o bot erra
 * a qualquer altura do duelo — o que ele não fazia (playtest de 11/10).
 */
export interface BotSkillConfig {
  /** O mínimo do primeiro instante em que vê o alvo até poder puxar o gatilho. */
  readonly reactionS: number
  /** O sorteio por cima do mínimo, de 0 a isto: reação que varia não é metrônomo. */
  readonly reactionSpreadS: number
  /** O erro da mira no instante em que o alvo aparece, em semi-ângulo. */
  readonly aimErrorDeg: number
  /** O erro que sobra depois de a mira assentar. É o teto de precisão do bot. */
  readonly aimResidualDeg: number
  /** Quanto a mira leva para ir de `aimErrorDeg` a `aimResidualDeg`, em linha reta. */
  readonly aimSettleS: number
  /**
   * O atraso de quem segue alvo andando: o erro, em metros, é a velocidade
   * lateral do alvo vezes isto — a velocidade angular vista pelo bot, vezes a
   * distância. Correr de lado contra o bot é o que deve salvar o jogador.
   */
  readonly trackingLagS: number
  /** O erro somado com o bot andando na velocidade de corrida, em proporção. */
  readonly movingErrorDeg: number
  /** O erro somado com o bot no ar. */
  readonly airborneErrorDeg: number
  /** O erro somado durante o susto de um quase-tiro (`bots.flinchS`). */
  readonly flinchErrorDeg: number
  /**
   * Quanto o alvo tem que ficar ao alcance da faca antes de o bot golpear. A
   * faca mata em um, e sem isto qualquer nível esfaqueava no tick em que o
   * jogador encostava — o fácil incluído (pedido de 11/10).
   */
  readonly meleeReactionS: number
}

export interface GameplayConfig {
  readonly simulation: SimulationConfig
  readonly movement: MovementConfig
  readonly grapple: GrappleConfig
  readonly collision: CollisionConfig
  readonly camera: CameraConfig
  readonly weapon: WeaponConfig
  readonly melee: MeleeConfig
  readonly match: MatchConfig
  readonly medals: MedalsConfig
  readonly bots: BotsConfig
  readonly botSkillEasy: BotSkillConfig
  readonly botSkillNormal: BotSkillConfig
  readonly botSkillHard: BotSkillConfig
}
