import { lengthSquared, normalizeInPlace, type Vector3 } from '../math/vector3.ts'
import type { Stance } from '../movement/characterState.ts'
import type { MovementInput } from '../movement/movementInput.ts'
import type { WeaponInput } from '../weapon/weaponInput.ts'

/**
 * O formato de fio do canal de jogo: os inteiros que o servidor e o cliente
 * trocam no lugar de float cru (nfr.md, "estado de rede quantizado"). Fica no
 * núcleo porque os dois lados precisam do mesmo arredondamento, e a resolução
 * de cada campo está na Tabela 4 de `docs/rede/arquitetura-de-rede.md`.
 *
 * A mira viaja como direção quantizada, não como yaw e pitch: voltar de ângulo
 * para vetor exige seno e cosseno, que o núcleo proíbe (`coreIsDeterministic`),
 * e a raiz quadrada da normalização é exata no IEEE.
 */

/** O input de um tick, como o schema do colyseus o transporta. */
export interface WireInput {
  readonly wishX: number
  readonly wishZ: number
  readonly buttons: number
  readonly aimX: number
  readonly aimY: number
  readonly aimZ: number
}

export interface WireAim {
  readonly aimX: number
  readonly aimY: number
  readonly aimZ: number
}

export interface WireButtons {
  readonly sprint: boolean
  readonly jump: boolean
  readonly crouch: boolean
  readonly fire: boolean
  readonly scope: boolean
  readonly reload: boolean
}

const INT16_MIN = -32768
const INT16_MAX = 32767
const WISH_STEPS = 127
const AIM_STEPS = 32767
const MM_PER_M = 1000

const BUTTON_BITS: readonly (keyof WireButtons)[] = [
  'sprint',
  'jump',
  'crouch',
  'fire',
  'scope',
  'reload',
]

const STANCES: readonly Stance[] = ['standing', 'crouching', 'sliding']
const GROUNDED_BIT = 0b100

function assertFinite(value: number, what: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${what} recebeu ${value}; esperado número finito`)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Metros para milímetros em `int16`. Satura em ±32,767 m em vez de dar a
 * volta: um valor fora da arena é defeito, mas derrubar a sala na feira por
 * causa dele é pior que desenhar o jogador na borda.
 *
 * ```ts
 * quantizePositionM(12.3456) // 12346
 * ```
 */
export function quantizePositionM(meters: number): number {
  assertFinite(meters, 'quantizePositionM')
  return clamp(Math.round(meters * MM_PER_M), INT16_MIN, INT16_MAX)
}

export function dequantizePositionM(millimeters: number): number {
  return millimeters / MM_PER_M
}

/** A mira que `quantizeAim` escreve, reaproveitada a cada tick. */
export type MutableWireAim = { -readonly [Key in keyof WireAim]: WireAim[Key] }

/**
 * Direção de mira em três `int16`, escrita em `out` sem alocar: roda a cada
 * tick de input, e o nfr.md proíbe alocação no caminho quente. Não precisa vir
 * unitária.
 *
 * ```ts
 * quantizeAim(cameraForward, wireInput)
 * ```
 */
export function quantizeAim<Out extends MutableWireAim>(aim: Readonly<Vector3>, out: Out): Out {
  const length = Math.sqrt(lengthSquared(aim))
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new RangeError(
      `quantizeAim recebeu (${aim.x}, ${aim.y}, ${aim.z}); esperado vetor não nulo e finito`,
    )
  }
  out.aimX = Math.round((aim.x / length) * AIM_STEPS)
  out.aimY = Math.round((aim.y / length) * AIM_STEPS)
  out.aimZ = Math.round((aim.z / length) * AIM_STEPS)
  return out
}

const aimScratch: MutableWireAim = { aimX: 0, aimY: 0, aimZ: 0 }

/**
 * A mira exatamente como o servidor vai lê-la, escrita em `out`: quantizada e
 * de volta a vetor unitário. O tiro previsto no cliente sai nesta direção, e
 * não na da câmera, pelo mesmo motivo de `wishOnWire`: o servidor resolve o tiro
 * com a mira do fio, e um raio diferente no último dígito erra onde o outro acerta.
 *
 * ```ts
 * aimOnWire(frame.aimM, shotAim)
 * ```
 */
export function aimOnWire(aim: Readonly<Vector3>, out: Vector3): Vector3 {
  return dequantizeAim(quantizeAim(aim, aimScratch), out)
}

/** Escreve em `out` a direção unitária, sem alocar. */
export function dequantizeAim(wire: WireAim, out: Vector3): Vector3 {
  out.x = wire.aimX
  out.y = wire.aimY
  out.z = wire.aimZ
  return normalizeInPlace(out)
}

/** Um eixo da direção desejada em `int8`. O núcleo normaliza a direção depois. */
export function quantizeWish(axis: number): number {
  assertFinite(axis, 'quantizeWish')
  return clamp(Math.round(axis * WISH_STEPS), -WISH_STEPS, WISH_STEPS)
}

/**
 * O eixo da direção desejada exatamente como o servidor vai lê-lo: arredondado
 * a 1/127, a resolução do `int8` do fio. A predição do cliente anda com este
 * valor, e não com o do teclado e da câmera; com o valor cru, cliente e
 * servidor simulavam direções diferentes no último dígito, e metade das
 * confirmações do servidor virava correção.
 *
 * ```ts
 * movementInput.wishX = wishOnWire(movementInput.wishX)
 * ```
 */
export function wishOnWire(axis: number): number {
  return quantizeWish(axis) / WISH_STEPS
}

/** Sem closure nem objeto novo: roda a cada tick de input. */
export function encodeButtons(buttons: WireButtons): number {
  let bits = 0
  for (let bit = 0; bit < BUTTON_BITS.length; bit += 1) {
    const name = BUTTON_BITS[bit]
    if (name && buttons[name]) bits |= 1 << bit
  }
  return bits
}

export function decodeButtons(bits: number): WireButtons {
  const has = (name: keyof WireButtons): boolean => (bits & (1 << BUTTON_BITS.indexOf(name))) !== 0
  return {
    sprint: has('sprint'),
    jump: has('jump'),
    crouch: has('crouch'),
    fire: has('fire'),
    scope: has('scope'),
    reload: has('reload'),
  }
}

/** Postura nos dois bits de baixo e o `grounded` no terceiro: um `uint8`. */
export function encodeStance(stance: Stance, grounded: boolean): number {
  return STANCES.indexOf(stance) | (grounded ? GROUNDED_BIT : 0)
}

export function decodeStance(bits: number): { stance: Stance; grounded: boolean } {
  const stance = STANCES[bits & 0b11]
  if (stance === undefined) {
    throw new RangeError(
      `decodeStance recebeu ${bits}; esperado postura de 0 a ${STANCES.length - 1}`,
    )
  }
  return { stance, grounded: (bits & GROUNDED_BIT) !== 0 }
}

/**
 * O input de movimento de um tick, a partir do fio. `scoped` vem do estado da
 * arma no servidor, não do botão de mira: é a mesma regra do `MovementInput`.
 *
 * ```ts
 * stepMatchPlayer(match, sessionId, decodeMovementInput(wire, weapon.scoped), boxes, config)
 * ```
 */
export function decodeMovementInput(wire: WireInput, scoped: boolean): MovementInput {
  const buttons = decodeButtons(wire.buttons)
  return {
    wishX: wire.wishX / WISH_STEPS,
    wishZ: wire.wishZ / WISH_STEPS,
    sprint: buttons.sprint,
    jump: buttons.jump,
    crouch: buttons.crouch,
    scoped,
  }
}

/**
 * O input da arma de um tick, a partir do fio: os botões presos de disparo,
 * mira e recarga, que o servidor passa ao mesmo `stepWeapon` do cliente.
 *
 * ```ts
 * stepWeapon(seat.weapon, decodeWeaponInput(wire), config, dtS)
 * ```
 */
export function decodeWeaponInput(wire: WireInput): WeaponInput {
  const buttons = decodeButtons(wire.buttons)
  return { fire: buttons.fire, scope: buttons.scope, reload: buttons.reload }
}

/**
 * A confirmação da kill, do servidor só para o atirador. O cliente não prevê
 * acerto em jogador (o acerto é do servidor), então o hitmarker espera por ela:
 * chega meio RTT depois do input que disparou.
 */
export const KILL_MESSAGE = 'shot.kill'

/**
 * O que o atirador precisa para pontuar a kill como a de um boneco: as
 * medalhas leem distância, altura do acerto, luneta e se ele estava no ar, e
 * só o servidor tem o tiro validado.
 */
export interface KillMessage {
  readonly victimId: string
  readonly distanceM: number
  readonly hitHeightRatio: number
  readonly scoped: boolean
  readonly shooterAirborne: boolean
}
