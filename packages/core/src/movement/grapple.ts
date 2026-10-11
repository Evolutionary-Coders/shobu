import { createBoxHit, nearestBoxHit } from '../collision/raycastBoxes.ts'
import type { StaticBox } from '../collision/staticBox.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { clampLength, dot, type Vector3 } from '../math/vector3.ts'
import { type CharacterState, EYE_HEIGHT_RATIO } from './characterState.ts'
import { type MovementInput, wishUnit } from './movementInput.ts'
import { endSlide } from './slide.ts'

/**
 * O gancho: um cabo disparado do olho na direção da mira, que prende na
 * primeira caixa da arena dentro de `grapple.maxRangeM` e vira **corda**. A
 * referência é o titanfall 2 com o balanço do ghostrunner, e as regras são as
 * do modelo de simulação, seção "gancho":
 *
 * - **a corda é restrição, não mola**: ela só impede o olho de se afastar da
 *   âncora além do comprimento. Gravidade, puxão e o empurrão do jogador
 *   continuam agindo, e é a restrição que transforma queda em arco — o
 *   balanço sai da física, não de animação.
 * - **o carretel puxa ao longo da corda** e ela só encurta, até
 *   `minRopeLengthM`; ali o puxão para e sobra um pêndulo. Agachar segura o
 *   carretel: a corda fica do tamanho que está, e o jogador balança nela.
 * - **puxão radial conserva o momento angular** em volta da âncora: quem chega
 *   de lado gira mais rápido à medida que a corda encurta. É o estilingue, e é
 *   de graça — nenhuma linha aqui o programa.
 * - **soltar preserva a velocidade**, e o `steer.ts` já mantém o excedente no
 *   ar. Pular solta com impulso; soltar a tecla solta sem.
 * - **a corda não rompe por obstrução**: a linha até a âncora não é testada
 *   tick a tick. Previsível para quem joga, barato para o servidor, e numa
 *   cidade de quinas uma corda que some ao raspar num toldo seria o defeito
 *   mais relatado da feira.
 *
 * Nada aqui aloca nem usa trigonometria: produto escalar, raiz e divisão.
 */

/** Abaixo disto a mira é "sem mira": o vetor nulo não tem direção para normalizar. */
const MIN_AIM_LENGTH_SQUARED = 1e-12

// rascunhos do módulo, o mesmo desenho do `probe` de `sweepCharacter.ts`: nada
// aloca no caminho quente, e o núcleo roda num fio só.
const hit = createBoxHit()
const eye: Vector3 = { x: 0, y: 0, z: 0 }
const aimUnit: Vector3 = { x: 0, y: 0, z: 0 }
const towardAnchor: Vector3 = { x: 0, y: 0, z: 0 }

/** O que o tick sabe das teclas antes de mexer em qualquer coisa. */
export interface GrappleEdges {
  readonly jumpPressed: boolean
  readonly grapplePressed: boolean
}

/**
 * De onde o cabo sai e onde ele prende no corpo: o olho. É o mesmo ponto que a
 * câmera mostra, então a corda que o jogador vê é a corda que a física usa.
 *
 * ```ts
 * grappleEyeM(state, out) // out.y === state.position.y + 0.92 · capsuleHeightM
 * ```
 */
export function grappleEyeM(state: Readonly<CharacterState>, out: Vector3): Vector3 {
  out.x = state.position.x
  out.y = state.position.y + state.capsuleHeightM * EYE_HEIGHT_RATIO
  out.z = state.position.z
  return out
}

/**
 * Onde o gancho engataria se fosse disparado agora, ou `undefined` se não há
 * superfície entre `minRopeLengthM` e `maxRangeM` na mira. Escreve a âncora em
 * `out` só quando acerta.
 *
 * É o mesmo teste do disparo, exportado para a retícula avisar **antes** do
 * aperto se há onde prender — o cliente chama uma vez por tick, não por quadro.
 *
 * ```ts
 * const distanceM = findGrappleAnchor(state, input, boxes, config, anchor)
 * if (distanceM !== undefined) reticle.inReach = true
 * ```
 */
export function findGrappleAnchor(
  state: Readonly<CharacterState>,
  aim: Pick<MovementInput, 'aimX' | 'aimY' | 'aimZ'>,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
  out: Vector3,
): number | undefined {
  if (!unitAim(aim, aimUnit)) return undefined
  grappleEyeM(state, eye)
  if (!nearestBoxHit(eye, aimUnit, boxes, config.grapple.maxRangeM, hit)) return undefined
  if (hit.distanceM < config.grapple.minRopeLengthM) return undefined
  out.x = eye.x + aimUnit.x * hit.distanceM
  out.y = eye.y + aimUnit.y * hit.distanceM
  out.z = eye.z + aimUnit.z * hit.distanceM
  return hit.distanceM
}

function unitAim(aim: Pick<MovementInput, 'aimX' | 'aimY' | 'aimZ'>, out: Vector3): boolean {
  const squared = aim.aimX * aim.aimX + aim.aimY * aim.aimY + aim.aimZ * aim.aimZ
  if (squared < MIN_AIM_LENGTH_SQUARED) return false
  const scale = 1 / Math.sqrt(squared)
  out.x = aim.aimX * scale
  out.y = aim.aimY * scale
  out.z = aim.aimZ * scale
  return true
}

/**
 * Engatado, o relógio do engate anda e a recarga fica parada; solto, a
 * recarga desce. É isso que faz a recarga contar **da soltura**: contando do
 * disparo, uma recarga menor que `maxAttachedS` não seria limite nenhum — o
 * mesmo argumento do cooldown do slide.
 */
export function tickGrapple(state: CharacterState, dtS: number): void {
  if (state.grappleAttached) {
    state.grappleAttachedS += dtS
    return
  }
  state.grappleCooldownLeftS = Math.max(0, state.grappleCooldownLeftS - dtS)
}

/**
 * Dispara, ou solta. Devolve `true` quando o pulo do tick foi gasto soltando a
 * corda — quem chama não pode pular de novo com o mesmo aperto.
 *
 * Solta por três motivos: a tecla subiu, o pulo desceu, ou o engate passou de
 * `maxAttachedS`.
 *
 * ```ts
 * const jumpSpent = updateGrappleLink(state, input, edges, boxes, config)
 * if (edges.jumpPressed && !jumpSpent) tryJump(state, config)
 * ```
 */
export function updateGrappleLink(
  state: CharacterState,
  input: MovementInput,
  edges: GrappleEdges,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): boolean {
  if (!state.grappleAttached) {
    if (edges.grapplePressed && state.grappleCooldownLeftS <= 0) {
      fireGrapple(state, input, boxes, config)
    }
    return false
  }
  if (edges.jumpPressed) {
    releaseGrapple(state, true, config)
    return true
  }
  if (!input.grapple || state.grappleAttachedS >= config.grapple.maxAttachedS) {
    releaseGrapple(state, false, config)
  }
  return false
}

/**
 * Errar custa `missCooldownS`, curto: o aviso da retícula já diz quando não há
 * onde prender, e quem dispara no vazio mesmo assim aprende sem perder o
 * gancho da próxima rota. Acertar trava a recarga cheia, que só começa a
 * descer na soltura (`tickGrapple`).
 *
 * O slide acaba no engate: a corda decide o movimento a partir daqui, e um
 * slide que continuasse por baixo dela frearia o jogador no chão.
 */
function fireGrapple(
  state: CharacterState,
  input: MovementInput,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): void {
  const distanceM = findGrappleAnchor(state, input, boxes, config, state.grappleAnchor)
  if (distanceM === undefined) {
    state.grappleCooldownLeftS = config.grapple.missCooldownS
    return
  }
  state.grappleAttached = true
  state.grappleRopeM = distanceM
  state.grappleAttachedS = 0
  state.grappleCooldownLeftS = config.grapple.cooldownS
  if (state.stance === 'sliding') endSlide(state, config, 'standing')
}

/**
 * **O gancho devolve o pulo duplo**: quem solta a corda sai com pelo menos um
 * pulo no ar, para corrigir a trajetória do lançamento. É o que encadeia
 * gancho, salto e pulo duplo numa rota só, que é o pilar 3; a recarga do
 * gancho é o que limita a repetição.
 *
 * Pular para soltar já é o primeiro desses saltos: sobe a pelo menos
 * `jumpImpulseMps` — sem cortar quem já subia mais rápido, porque a saída
 * preserva velocidade — e deixa exatamente o pulo duplo.
 */
function releaseGrapple(state: CharacterState, jumped: boolean, config: GameplayConfig): void {
  state.grappleAttached = false
  state.grappleAttachedS = 0
  if (!jumped) {
    state.jumpsLeft = Math.max(state.jumpsLeft, 1)
    return
  }
  state.velocity.y = Math.max(state.velocity.y, config.movement.jumpImpulseMps)
  state.jumpsLeft = 1
  state.grounded = false
}

/**
 * Pendurado, o jogador empurra o balanço com o wasd. Sem o teto do ar de
 * `steerInAir`: na corda quem limita é `maxPullSpeedMps`, aplicado depois em
 * `pullOnRope` sobre a velocidade inteira.
 *
 * ```ts
 * steerOnRope(state, input, config, dtS)
 * ```
 */
export function steerOnRope(
  state: CharacterState,
  input: MovementInput,
  config: GameplayConfig,
  dtS: number,
): void {
  const push = config.grapple.swingAccelerationMps2 * dtS
  state.velocity.x += wishUnit(input, 'x') * push
  state.velocity.z += wishUnit(input, 'z') * push
}

/**
 * O carretel e a corda, sobre a velocidade e **antes** da varredura: assim a
 * correção de posição passa pela colisão como qualquer outro movimento, e a
 * corda nunca puxa o jogador através de uma parede.
 *
 * 1. o carretel acelera o jogador para a âncora, se a corda está acima do
 *    mínimo e ele não segura o comprimento (agachar);
 * 2. a restrição tira o que a velocidade tem de **para fora** além do que a
 *    folga permite neste tick — é o que vira queda em arco;
 * 3. o teto de `maxPullSpeedMps` vale para a velocidade inteira.
 *
 * ```ts
 * applyGravity(state, config, dtS)
 * if (state.grappleAttached) pullOnRope(state, input, config, dtS)
 * ```
 */
export function pullOnRope(
  state: CharacterState,
  input: MovementInput,
  config: GameplayConfig,
  dtS: number,
): void {
  const distanceM = anchorDirection(state, towardAnchor)
  if (distanceM === 0) return
  const { grapple } = config
  if (!input.crouch && distanceM > grapple.minRopeLengthM) {
    const pull = grapple.pullAccelerationMps2 * dtS
    state.velocity.x += towardAnchor.x * pull
    state.velocity.y += towardAnchor.y * pull
    state.velocity.z += towardAnchor.z * pull
  }
  holdRope(state, distanceM, dtS)
  clampLength(state.velocity, grapple.maxPullSpeedMps)
}

/**
 * Tira da velocidade o que leva para fora da corda além da folga deste tick.
 * Com a corda esticada a folga é negativa, e a correção **puxa de volta** o
 * pouco que a reta do tick anterior escapou da curva: sem isso o pêndulo
 * alargaria um fio a cada tick.
 */
function holdRope(state: CharacterState, distanceM: number, dtS: number): void {
  const outwardMps = -dot(state.velocity, towardAnchor)
  const allowedMps = (state.grappleRopeM - distanceM) / dtS
  if (outwardMps <= allowedMps) return
  const excess = outwardMps - allowedMps
  state.velocity.x += towardAnchor.x * excess
  state.velocity.y += towardAnchor.y * excess
  state.velocity.z += towardAnchor.z * excess
}

/**
 * A corda só encurta: depois da varredura, o comprimento passa a ser o menor
 * entre o que era e a distância de agora, nunca abaixo do mínimo. É um
 * carretel que recolhe a folga sozinho — a corda nunca fica bamba, e o
 * balanço seguinte gira no raio novo.
 *
 * ```ts
 * sweepCharacter(state, boxes, config, dtS)
 * if (state.grappleAttached) takeUpSlack(state, config)
 * ```
 */
export function takeUpSlack(state: CharacterState, config: GameplayConfig): void {
  const distanceM = anchorDirection(state, towardAnchor)
  const shortest = Math.min(state.grappleRopeM, distanceM)
  state.grappleRopeM = Math.max(config.grapple.minRopeLengthM, shortest)
}

/**
 * Unitário do olho para a âncora em `out`, e a distância. Olho exatamente na
 * âncora devolve 0 e deixa `out` como estava: não há direção, e dividir por
 * zero espalharia NaN pelo estado.
 */
function anchorDirection(state: Readonly<CharacterState>, out: Vector3): number {
  grappleEyeM(state, eye)
  const x = state.grappleAnchor.x - eye.x
  const y = state.grappleAnchor.y - eye.y
  const z = state.grappleAnchor.z - eye.z
  const distanceM = Math.sqrt(x * x + y * y + z * z)
  if (distanceM === 0) return 0
  out.x = x / distanceM
  out.y = y / distanceM
  out.z = z / distanceM
  return distanceM
}
