import {
  type CharacterState,
  consumeTicks,
  copyCharacterState,
  createCharacterState,
  createFixedTickAccumulator,
  EYE_HEIGHT_RATIO,
  type FixedTickAccumulator,
  type GameplayConfig,
  type MovementInput,
  respawnCharacter,
  type StaticBox,
  stepCharacter,
  type Vector3,
} from '@shobu/core'

/**
 * O jogador local: o estado do núcleo avançado em ticks fixos a partir do
 * tempo de quadro, e o tick anterior guardado para o render **interpolar**.
 * É a separação das três taxas do modelo de simulação: a simulação anda a
 * 60 Hz, o render desenha na taxa do monitor, e o que ele desenha é uma
 * mistura dos dois últimos estados, não o último — senão a 240 Hz o jogador
 * veria três quadros iguais e um pulo.
 *
 * Quando o servidor existir (ADR 0002), a predição é isto mesmo, mais a
 * reconciliação: o estado é substituído pelo do servidor e os ticks desde então
 * são reexecutados com as entradas guardadas. Por isso nada aqui conhece o
 * babylon.
 */
export interface LocalCharacter {
  /** O último tick simulado. */
  readonly current: Readonly<CharacterState>
  /** O tick antes dele, para interpolar. */
  readonly previous: Readonly<CharacterState>
  /** Avança a simulação pelo tempo de quadro. Devolve quantos ticks rodaram. */
  advance(elapsedS: number, input: MovementInput): number
  /**
   * Quantos ticks cabem no tempo de quadro, já consumidos do acumulador.
   *
   * Existe para a arma e o personagem alternarem **dentro do mesmo tick, com
   * um acumulador só**: dois acumuladores derivariam, e rodar a arma fora de
   * fase com o corpo deixa o estado da mira um tick atrasado — a mesma classe
   * de ambiguidade que o docblock de `stepCharacter` documenta sobre o
   * `grounded`.
   */
  pendingTicks(elapsedS: number): number
  /** Um tick, guardando o anterior para interpolar. */
  stepOnce(input: MovementInput): void
  /**
   * Põe o corpo parado num pé novo, no tick atual **e** no anterior. Os dois,
   * porque a interpolação mistura os dois: mexer só no atual faria a câmera
   * atravessar o mapa voando por um quadro, do lugar da morte até o spawn.
   *
   * O estado inteiro volta ao de nascimento — em pé, sem slide, com os dois
   * pulos —, e não só a posição: reaparecer no meio de um slide herdado seria
   * nascer andando.
   */
  respawnAt(feetM: Readonly<Vector3>): void
  /**
   * Congela o corpo onde está, nos dois ticks: é a câmera parada na posição
   * da morte, do GDD. Sem copiar o atual sobre o anterior, a interpolação
   * ainda misturaria os dois e a câmera tremeria no lugar até o respawn.
   */
  holdStill(): void
  /**
   * Adota o estado que a reconciliação recalculou: o tick atual e o anterior,
   * para a interpolação do quadro continuar entre dois ticks verdadeiros.
   */
  adopt(current: Readonly<CharacterState>, previous: Readonly<CharacterState>): void
  readonly tickDurationS: number
  /** Quanto do próximo tick já passou, de 0 a 1: o peso de `current` na interpolação. */
  interpolationAlpha(): number
  /** Onde o olho está neste quadro, interpolado. Escreve em `out` e o devolve. */
  eyePosition(out: Vector3): Vector3
}

/**
 * Teto de ticks por quadro. Um quadro de 100 ms pede seis ticks; acima disso
 * o jogo atrasa em vez de entrar na espiral em que cada quadro pede mais que
 * o anterior (ver `fixedTickAccumulator`).
 */
const MAX_TICKS_PER_FRAME = 6

/**
 * ```ts
 * const character = createLocalCharacter(config, feetM, blockoutToStaticBoxes(GREYBOX_BLOCKOUT))
 * character.advance(engine.getDeltaTime() / 1000, input)
 * ```
 */
export function createLocalCharacter(
  config: GameplayConfig,
  spawnFeetM: Readonly<Vector3>,
  boxes: readonly StaticBox[],
): LocalCharacter {
  const current = createCharacterState(spawnFeetM, config)
  const previous = createCharacterState(spawnFeetM, config)
  const clock = createFixedTickAccumulator(config.simulation.tickHz, MAX_TICKS_PER_FRAME)
  // `advance` recebe o tempo do quadro; `consumeTicks` decide quantos ticks
  // cabem. o tempo que sobra fica no acumulador e vira o alfa da interpolação.
  const pendingTicks = (elapsedS: number): number => consumeTicks(clock, elapsedS)
  const stepOnce = (input: MovementInput): void =>
    stepKeepingPrevious(current, previous, input, boxes, config, clock.tickDurationS)
  return {
    current,
    previous,
    tickDurationS: clock.tickDurationS,
    pendingTicks,
    stepOnce,
    ...stateReplacements(current, previous, config),
    advance: (elapsedS, input) => {
      const ticks = pendingTicks(elapsedS)
      for (let index = 0; index < ticks; index += 1) stepOnce(input)
      return ticks
    },
    interpolationAlpha: () => clock.pendingS / clock.tickDurationS,
    eyePosition: (out) => eyePosition(current, previous, clock, out),
  }
}

function stepKeepingPrevious(
  current: CharacterState,
  previous: CharacterState,
  input: MovementInput,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
  tickDurationS: number,
): void {
  copyCharacterState(current, previous)
  stepCharacter(current, input, boxes, config, tickDurationS)
}

/** As formas de trocar o estado por fora da simulação: o spawn, a morte e a reconciliação. */
function stateReplacements(
  current: CharacterState,
  previous: CharacterState,
  config: GameplayConfig,
): Pick<LocalCharacter, 'respawnAt' | 'holdStill' | 'adopt'> {
  return {
    respawnAt: (feetM) => respawnAt(current, previous, feetM, config),
    holdStill: () => holdStill(current, previous),
    adopt: (nextCurrent, nextPrevious) => {
      copyCharacterState(nextCurrent, current)
      copyCharacterState(nextPrevious, previous)
    },
  }
}

function holdStill(current: CharacterState, previous: CharacterState): void {
  // a morte apaga o agachar alternado: o respawn já o zeraria, mas o botão de
  // toque aceso durante a tela de morte dizia que o pedido sobrevivia.
  current.crouchToggled = false
  // e solta o gancho: a corda presa seguia desenhada a tela de morte inteira,
  // e atrás da tela do MVP no fim da partida (revisão do PR #31).
  current.grappleAttached = false
  current.grappleAttachedS = 0
  current.velocity.x = 0
  current.velocity.y = 0
  current.velocity.z = 0
  copyCharacterState(current, previous)
}

/**
 * Aloca um estado por reaparição, e só nela: é evento de segundos, fora do
 * caminho quente de tick. As teclas presas atravessam a morte
 * (`respawnCharacter`).
 */
function respawnAt(
  current: CharacterState,
  previous: CharacterState,
  feetM: Readonly<Vector3>,
  config: GameplayConfig,
): void {
  respawnCharacter(current, feetM, config)
  copyCharacterState(current, previous)
}

/**
 * O olho fica a `EYE_HEIGHT_RATIO` da cápsula — e a cápsula encolhe agachado
 * e no slide, então a altura do olho também interpola: é o que faz a câmera
 * **descer** no slide em vez de saltar para a altura nova.
 */
function eyePosition(
  current: Readonly<CharacterState>,
  previous: Readonly<CharacterState>,
  clock: FixedTickAccumulator,
  out: Vector3,
): Vector3 {
  const alpha = clock.pendingS / clock.tickDurationS
  out.x = mix(previous.position.x, current.position.x, alpha)
  out.z = mix(previous.position.z, current.position.z, alpha)
  const feetY = mix(previous.position.y, current.position.y, alpha)
  out.y = feetY + mix(previous.capsuleHeightM, current.capsuleHeightM, alpha) * EYE_HEIGHT_RATIO
  return out
}

function mix(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}
