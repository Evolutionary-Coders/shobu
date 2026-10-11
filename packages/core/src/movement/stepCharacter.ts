import type { StaticBox } from '../collision/staticBox.ts'
import { sweepCharacter } from '../collision/sweepCharacter.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { CharacterState } from './characterState.ts'
import { updateCrouch } from './crouch.ts'
import { applyGravity, settleOnGround, tryJump } from './jump.ts'
import { assertFiniteInput, type MovementInput } from './movementInput.ts'
import { canStartSlide, continueSlide, startSlide } from './slide.ts'
import { steerInAir, steerOnGround, updateSprint } from './steer.ts'

/**
 * Um tick da simulação do jogador: entrada → estado. É **o** módulo que o
 * cliente prediz e o servidor autoriza, importado igual pelos dois (ADR 0003).
 * Tudo aqui é aritmética determinística: sem `Math.random`, sem relógio, sem
 * trigonometria, e o passo de tempo é fixo — quem chama converte tempo real em
 * ticks com o `fixedTickAccumulator`.
 *
 * A ordem é a decisão aberta nº 3 do modelo de simulação, e fica fechada aqui:
 * **o `grounded` que este tick lê é o do fim do tick anterior.** Entrada e
 * aceleração usam esse valor; a varredura do fim recalcula para o próximo. É
 * uma ambiguidade que faria cliente e servidor divergirem se cada um
 * escolhesse a sua, e o teste de replay é o que a prende.
 *
 * ```ts
 * stepCharacter(state, input, arenaBoxes, config, 1 / config.simulation.tickHz)
 * ```
 */
export function stepCharacter(
  state: CharacterState,
  input: MovementInput,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
  dtS: number,
): void {
  assertTickDuration(dtS)
  assertFiniteInput(input)
  const jumpPressed = input.jump && !state.jumpWasHeld
  const crouchPressed = input.crouch && !state.crouchWasHeld
  tickCooldowns(state, dtS)
  updateSprint(state, input)
  moveOnIntent(
    state,
    input,
    boxes,
    { jumpPressed, crouchPressed, crouchHeld: input.crouch },
    config,
    dtS,
  )
  if (jumpPressed) tryJump(state, config)
  applyGravity(state, config, dtS)
  sweepCharacter(state, boxes, config, dtS)
  settleOnGround(state)
  rememberHeldKeys(state, input)
}

interface InputEdges {
  readonly jumpPressed: boolean
  readonly crouchPressed: boolean
  readonly crouchHeld: boolean
}

/**
 * Slide em curso, slide começando, agachar ou levantar, e então a direção
 * normal no chão ou no ar. A tecla de agachar tem dois sentidos e a ordem é
 * que os separa: em corrida tática plena ela desliza; fora disso, agacha.
 */
function moveOnIntent(
  state: CharacterState,
  input: MovementInput,
  boxes: readonly StaticBox[],
  edges: InputEdges,
  config: GameplayConfig,
  dtS: number,
): void {
  if (state.stance === 'sliding') {
    continueSlide(state, edges, config, dtS)
    return
  }
  if (edges.crouchPressed && canStartSlide(state, config)) {
    startSlide(state, config)
    return
  }
  updateCrouch(state, input, boxes, config)
  if (state.grounded) steerOnGround(state, input, config, dtS)
  else steerInAir(state, input, config, dtS)
}

function tickCooldowns(state: CharacterState, dtS: number): void {
  state.slideCooldownLeftS = Math.max(0, state.slideCooldownLeftS - dtS)
}

function rememberHeldKeys(state: CharacterState, input: MovementInput): void {
  state.jumpWasHeld = input.jump
  state.crouchWasHeld = input.crouch
}

function assertTickDuration(dtS: number): void {
  if (!Number.isFinite(dtS) || dtS <= 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado duração de tick finita > 0`)
  }
}
