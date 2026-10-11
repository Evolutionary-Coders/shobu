import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'

/**
 * O estado do jogador que a simulação avança a cada tick. É **todo** o estado:
 * o que não está aqui não existe para a predição, e é isso que permite gravar
 * uma sequência de entradas, reexecutar e comparar (ADR 0003).
 *
 * Mutável e reutilizado de propósito — o NFR proíbe alocar no caminho quente,
 * e um estado novo por tick por jogador vira pausa do coletor de lixo.
 */
export type Stance = 'standing' | 'crouching' | 'sliding'

/** Pulo mais pulo duplo: o que recarrega ao tocar o chão. */
export const JUMPS_PER_FLIGHT = 2

export interface CharacterState {
  /** O pé, em metros. O olho fica em `position.y + capsuleHeightM`, na convenção dos spawns. */
  readonly position: Vector3
  readonly velocity: Vector3
  /** Resultado da sondagem de chão do **último** tick — é o que o próximo tick lê. */
  grounded: boolean
  jumpsLeft: number
  stance: Stance
  slideTimeLeftS: number
  /** Conta do fim do slide, não da entrada (modelo de simulação). */
  slideCooldownLeftS: number
  sprinting: boolean
  /** Encolhe agachado e no slide: passa por baixo de linha de tiro e dá silhueta distinta. */
  capsuleHeightM: number
  /** Borda de tecla: pulo e slide disparam na descida, não enquanto a tecla está presa. */
  jumpWasHeld: boolean
  crouchWasHeld: boolean
}

/**
 * ```ts
 * const state = createCharacterState({ x: 26, y: 0, z: 26 }, config)
 * ```
 */
export function createCharacterState(
  feetM: Readonly<Vector3>,
  config: GameplayConfig,
): CharacterState {
  return {
    position: { x: feetM.x, y: feetM.y, z: feetM.z },
    velocity: { x: 0, y: 0, z: 0 },
    grounded: false,
    jumpsLeft: JUMPS_PER_FLIGHT,
    stance: 'standing',
    slideTimeLeftS: 0,
    slideCooldownLeftS: 0,
    sprinting: false,
    capsuleHeightM: config.collision.capsuleHeightM,
    jumpWasHeld: false,
    crouchWasHeld: false,
  }
}

/** Copia sem alocar: é como o render guarda o tick anterior para interpolar. */
export function copyCharacterState(
  from: Readonly<CharacterState>,
  into: CharacterState,
): CharacterState {
  into.position.x = from.position.x
  into.position.y = from.position.y
  into.position.z = from.position.z
  into.velocity.x = from.velocity.x
  into.velocity.y = from.velocity.y
  into.velocity.z = from.velocity.z
  copyScalars(from, into)
  return into
}

function copyScalars(from: Readonly<CharacterState>, into: CharacterState): void {
  into.grounded = from.grounded
  into.jumpsLeft = from.jumpsLeft
  into.stance = from.stance
  into.slideTimeLeftS = from.slideTimeLeftS
  into.slideCooldownLeftS = from.slideCooldownLeftS
  into.sprinting = from.sprinting
  into.capsuleHeightM = from.capsuleHeightM
  into.jumpWasHeld = from.jumpWasHeld
  into.crouchWasHeld = from.crouchWasHeld
}

/** Velocidade no plano do chão. É a grandeza de toda regra de corrida e slide. */
export function horizontalSpeed(state: Readonly<CharacterState>): number {
  const { x, z } = state.velocity
  return Math.sqrt(x * x + z * z)
}
