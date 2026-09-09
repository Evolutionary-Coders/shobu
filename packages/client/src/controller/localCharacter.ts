import {
  type CharacterState,
  consumeTicks,
  copyCharacterState,
  createCharacterState,
  createFixedTickAccumulator,
  type FixedTickAccumulator,
  type GameplayConfig,
  type MovementInput,
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
  /** Quanto do próximo tick já passou, de 0 a 1: o peso de `current` na interpolação. */
  interpolationAlpha(): number
  /** Onde o olho está neste quadro, interpolado. Escreve em `out` e o devolve. */
  eyePosition(out: Vector3): Vector3
}

/**
 * Onde o olho fica na cápsula: 92 % da altura, como em gente de verdade. No
 * topo (100 %) o jogador olhava de cima para o avatar de 1,8 m e o achava
 * baixo — o olho de um corpo de 1,8 m está a uns 1,66 m, não a 1,8.
 */
export const EYE_HEIGHT_RATIO = 0.92

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
  return {
    current,
    previous,
    advance: (elapsedS, input) => advance(current, previous, clock, elapsedS, input, boxes, config),
    interpolationAlpha: () => clock.pendingS / clock.tickDurationS,
    eyePosition: (out) => eyePosition(current, previous, clock, out),
  }
}

function advance(
  current: CharacterState,
  previous: CharacterState,
  clock: FixedTickAccumulator,
  elapsedS: number,
  input: MovementInput,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): number {
  // `advance` recebe o tempo do quadro; `consumeTicks` decide quantos ticks
  // cabem. o tempo que sobra fica no acumulador e vira o alfa da interpolação.
  const ticks = consumeTicks(clock, elapsedS)
  for (let index = 0; index < ticks; index += 1) {
    copyCharacterState(current, previous)
    stepCharacter(current, input, boxes, config, clock.tickDurationS)
  }
  return ticks
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
