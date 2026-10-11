import type { StaticBox } from '../collision/staticBox.ts'
import { sweepCharacter } from '../collision/sweepCharacter.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { CharacterState } from './characterState.ts'
import { updateCrouch } from './crouch.ts'
import { applyDash } from './dash.ts'
import { pullOnRope, steerOnRope, takeUpSlack, tickGrapple, updateGrappleLink } from './grapple.ts'
import { applyGravity, settleOnGround, tryJump } from './jump.ts'
import { assertFiniteInput, type MovementInput } from './movementInput.ts'
import { canStartSlide, continueSlide, startSlide } from './slide.ts'
import { steerInAir, steerOnGround, updateSprint } from './steer.ts'
import { updateTacticalSprint } from './tacticalSprint.ts'

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
 * O gancho tem a mesma classe de ambiguidade, fechada do mesmo jeito: **o
 * engate e a soltura vêm antes da direção**, então o tick em que o cabo prende
 * já anda pendurado, e o pulo que solta a corda não vira um segundo pulo no
 * mesmo tick. A corda age **depois da gravidade e antes da varredura**.
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
  const edges = readEdges(state, input)
  tickCooldowns(state, dtS)
  updateSprint(state, input)
  updateTacticalSprint(state, input, config, dtS)
  // a investida antes da direção: o atrito do chão deste mesmo tick já começa
  // a desfazê-la, e é isso que a torna curta (`dash.ts`).
  if (input.dash) applyDash(state, input, config)
  const jumpSpent = updateGrappleLink(state, input, edges, boxes, config)
  moveOnIntent(state, input, boxes, edges, config, dtS)
  if (edges.jumpPressed && !jumpSpent) tryJump(state, config)
  applyGravity(state, config, dtS)
  // a corda depois da gravidade e antes da varredura: é a restrição que vira a
  // queda deste tick em arco, e a correção passa pela colisão (`grapple.ts`).
  if (state.grappleAttached) pullOnRope(state, input, config, dtS)
  sweepCharacter(state, boxes, config, dtS)
  settleOnGround(state)
  if (state.grappleAttached) takeUpSlack(state, config)
  rememberHeldKeys(state, input)
}

interface InputEdges {
  jumpPressed: boolean
  crouchPressed: boolean
  crouchHeld: boolean
  grapplePressed: boolean
}

// um rascunho só, reescrito a cada tick: o objeto literal por tick era lixo
// para o coletor, e o núcleo roda num fio só.
const edges: InputEdges = {
  jumpPressed: false,
  crouchPressed: false,
  crouchHeld: false,
  grapplePressed: false,
}

/** As bordas de descida, contra as teclas do tick anterior. */
function readEdges(state: Readonly<CharacterState>, input: MovementInput): InputEdges {
  edges.jumpPressed = input.jump && !state.jumpWasHeld
  edges.crouchPressed = input.crouch && !state.crouchWasHeld
  edges.crouchHeld = input.crouch
  edges.grapplePressed = input.grapple && !state.grappleWasHeld
  return edges
}

/**
 * Na corda, só o empurrão do balanço. Fora dela: slide em curso, slide
 * começando, agachar ou levantar, e então a direção normal no chão ou no ar. A
 * tecla de agachar tem dois sentidos e a ordem é que os separa: em corrida
 * tática plena ela desliza; fora disso, agacha. Pendurado ela tem um terceiro,
 * segurar o carretel, e quem lê isso é `pullOnRope`.
 */
function moveOnIntent(
  state: CharacterState,
  input: MovementInput,
  boxes: readonly StaticBox[],
  edges: InputEdges,
  config: GameplayConfig,
  dtS: number,
): void {
  if (state.grappleAttached) {
    steerOnRope(state, input, config, dtS)
    return
  }
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
  tickGrapple(state, dtS)
}

function rememberHeldKeys(state: CharacterState, input: MovementInput): void {
  state.jumpWasHeld = input.jump
  state.crouchWasHeld = input.crouch
  state.grappleWasHeld = input.grapple
  state.sprintWasHeld = input.sprint
}

function assertTickDuration(dtS: number): void {
  if (!Number.isFinite(dtS) || dtS <= 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado duração de tick finita > 0`)
  }
}
