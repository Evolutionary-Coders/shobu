import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { CharacterState } from '../movement/characterState.ts'
import { overlaps, overlapsAny, type PlayerBox, type StaticBox } from './staticBox.ts'

/**
 * Move o jogador pela velocidade do tick e resolve penetração contra as caixas
 * da arena, eixo a eixo, com **sub-passo por deslocamento** (ADR 0003): quando
 * o movimento do tick passa de `subStepMaxDisplacementM`, o passo é dividido,
 * e é isso — não tick maior — que impede atravessar parede fina em queda ou
 * no puxão do gancho.
 *
 * Eixo a eixo porque contra geometria alinhada é exato e barato: a resolução
 * de cada eixo é empurrar para a face mais próxima, e a ordem fixa (y, x, z)
 * é o que torna o resultado igual no cliente e no servidor.
 *
 * Sem alocação: um só volume de sondagem, reescrito a cada uso.
 */

/** Quanto abaixo do pé a sondagem de chão olha. Menor que qualquer degrau. */
const GROUND_PROBE_M = 0.02

/**
 * A pele de colisão. Depois de encostar numa parede a posição é `face ± raio`,
 * e `18.4 - 0.4` dá `17.999…`: em ponto flutuante a face encostada volta a ser
 * interseção. Sem a pele, a gravidade "aterrissava" o jogador no topo da
 * parede em que ele estava encostado. Cada eixo testa com o volume encolhido
 * nos **outros** dois, então encostar de lado nunca conta como chão e estar
 * no chão nunca conta como parede.
 */
const SKIN_M = 1e-4

type MutablePlayerBox = { -readonly [Key in keyof PlayerBox]: PlayerBox[Key] }

const probe: MutablePlayerBox = { feetX: 0, feetY: 0, feetZ: 0, radiusM: 0, heightM: 0 }

/**
 * ```ts
 * sweepCharacter(state, arenaBoxes, config, 1 / 60)
 * state.grounded // true se há chão a até 2 cm do pé
 * ```
 */
export function sweepCharacter(
  state: CharacterState,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
  dtS: number,
): void {
  const steps = subStepCount(state, config, dtS)
  const wasGrounded = state.grounded
  const stepX = (state.velocity.x * dtS) / steps
  const stepY = (state.velocity.y * dtS) / steps
  const stepZ = (state.velocity.z * dtS) / steps
  for (let index = 0; index < steps; index += 1) {
    moveVertical(state, stepY, boxes, config)
    moveHorizontal(state, 'x', stepX, boxes, config, wasGrounded)
    moveHorizontal(state, 'z', stepZ, boxes, config, wasGrounded)
  }
  state.grounded = probeGround(state, boxes, config)
}

/** Deslocamento do tick dividido pelo máximo por sub-passo, arredondado para cima. */
export function subStepCount(
  state: Readonly<CharacterState>,
  config: GameplayConfig,
  dtS: number,
): number {
  const { x, y, z } = state.velocity
  const displacement = Math.sqrt(x * x + y * y + z * z) * dtS
  return Math.max(1, Math.ceil(displacement / config.collision.subStepMaxDisplacementM))
}

function syncProbe(state: Readonly<CharacterState>, config: GameplayConfig): void {
  probe.feetX = state.position.x
  probe.feetY = state.position.y
  probe.feetZ = state.position.z
  probe.radiusM = config.collision.capsuleRadiusM
  probe.heightM = state.capsuleHeightM
}

function moveVertical(
  state: CharacterState,
  delta: number,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): void {
  state.position.y += delta
  syncProbe(state, config)
  probe.radiusM -= SKIN_M
  for (const box of boxes) {
    if (!overlaps(probe, box)) continue
    // descendo apoia no topo; subindo bate no fundo. em qualquer caso a
    // velocidade vertical morre: parede não devolve energia.
    state.position.y = delta < 0 ? box.maxY : box.minY - state.capsuleHeightM
    state.velocity.y = 0
    probe.feetY = state.position.y
  }
}

function moveHorizontal(
  state: CharacterState,
  axis: 'x' | 'z',
  delta: number,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
  wasGrounded: boolean,
): void {
  if (delta === 0) return
  state.position[axis] += delta
  syncProbe(state, config)
  probe.feetY += SKIN_M
  probe.heightM -= 2 * SKIN_M
  for (const box of boxes) {
    if (!overlaps(probe, box)) continue
    if (wasGrounded && tryStepUp(state, box, boxes, config)) continue
    blockAlong(state, axis, delta, box, config)
  }
}

/**
 * Degrau: se o topo da caixa está a até `stepHeightM` do pé e há espaço lá em
 * cima, o jogador sobe em vez de parar. Só no chão — no ar, borda é borda.
 */
function tryStepUp(
  state: CharacterState,
  box: StaticBox,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): boolean {
  const rise = box.maxY - state.position.y
  if (rise <= 0 || rise > config.collision.stepHeightM) return false
  const restoreY = probe.feetY
  probe.feetY = box.maxY + SKIN_M
  const blocked = overlapsAny(probe, boxes)
  probe.feetY = blocked ? restoreY : box.maxY + SKIN_M
  if (blocked) return false
  state.position.y = box.maxY
  return true
}

function blockAlong(
  state: CharacterState,
  axis: 'x' | 'z',
  delta: number,
  box: StaticBox,
  config: GameplayConfig,
): void {
  const radius = config.collision.capsuleRadiusM
  const min = axis === 'x' ? box.minX : box.minZ
  const max = axis === 'x' ? box.maxX : box.maxZ
  state.position[axis] = delta > 0 ? min - radius : max + radius
  state.velocity[axis] = 0
  if (axis === 'x') probe.feetX = state.position.x
  else probe.feetZ = state.position.z
}

/**
 * Cabe um jogador com `heightM` de altura onde este está? É o que decide se
 * quem está agachado pode levantar: levantar dentro de um teto baixo poria a
 * cabeça dentro da caixa, e a resolução vertical do tick seguinte o
 * empurraria para cima da caixa — pelo teto.
 *
 * ```ts
 * hasHeadroom(state, boxes, config, config.collision.capsuleHeightM)
 * ```
 */
export function hasHeadroom(
  state: Readonly<CharacterState>,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
  heightM: number,
): boolean {
  syncProbe(state, config)
  probe.feetY += SKIN_M
  probe.heightM = heightM - 2 * SKIN_M
  probe.radiusM -= SKIN_M
  return !overlapsAny(probe, boxes)
}

/**
 * Há chão se o volume deslocado 2 cm para baixo toca alguma caixa. Parede ao
 * lado não conta: a resolução horizontal deixa o jogador **encostado**, e
 * encostar não é interseção (ver `overlaps`).
 */
function probeGround(
  state: Readonly<CharacterState>,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): boolean {
  syncProbe(state, config)
  probe.feetY -= GROUND_PROBE_M
  probe.radiusM -= SKIN_M
  return overlapsAny(probe, boxes)
}
