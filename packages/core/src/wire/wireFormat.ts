import type { MutableMovementInput } from '../bots/botLocomotion.ts'
import { lengthSquared, normalizeInPlace, type Vector3 } from '../math/vector3.ts'
import type { MeleeWeapon } from '../melee/meleeState.ts'
import type { Stance } from '../movement/characterState.ts'
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

/** As teclas presas de um tick, cruas: as bordas e os interruptores são do núcleo. */
export interface WireButtons {
  readonly sprint: boolean
  readonly jump: boolean
  readonly crouch: boolean
  readonly grapple: boolean
  readonly fire: boolean
  readonly scope: boolean
  readonly aim: boolean
  readonly reload: boolean
  readonly melee: boolean
  readonly primary: boolean
}

const INT16_MIN = -32768
const INT16_MAX = 32767
const WISH_STEPS = 127
const AIM_STEPS = 32767
/**
 * 2 mm por passo: o `int16` cobre ±65,534 m. Com 1 mm ele cobria ±32,767 m, e
 * os mapas do catálogo têm 70 m de área de jogo e colisão até 63 m do centro
 * (o jogador pode ficar fora da área por `outOfBoundsGraceS`).
 */
const POSITION_STEPS_PER_M = 500

/** Dez teclas: o campo `buttons` do schema é `uint16`. */
const BUTTON_BITS: readonly (keyof WireButtons)[] = [
  'sprint',
  'jump',
  'crouch',
  'grapple',
  'fire',
  'scope',
  'aim',
  'reload',
  'melee',
  'primary',
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
 * Metros para passos de 2 mm em `int16`. Satura em ±65,534 m em vez de dar a
 * volta: um valor fora da arena é defeito, mas derrubar a sala na feira por
 * causa dele é pior que desenhar o jogador na borda.
 *
 * ```ts
 * quantizePositionM(12.3456) // 6173
 * ```
 */
export function quantizePositionM(meters: number): number {
  assertFinite(meters, 'quantizePositionM')
  return clamp(Math.round(meters * POSITION_STEPS_PER_M), INT16_MIN, INT16_MAX)
}

export function dequantizePositionM(steps: number): number {
  return steps / POSITION_STEPS_PER_M
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
    grapple: has('grapple'),
    fire: has('fire'),
    scope: has('scope'),
    aim: has('aim'),
    reload: has('reload'),
    melee: has('melee'),
    primary: has('primary'),
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
 * As teclas de movimento e a mira de um tick, a partir do fio, escritas em
 * `into`. Os campos que vêm do estado da arma (`scoped`, `sprintHeldByWeapon`,
 * `drawnBlade`, `dash`) ficam para o `armMovementInput`, como no cliente: o
 * servidor chega a eles pelo próprio arsenal, e não pelo que o cliente diz.
 * A mira do gancho é a mesma do tiro, a do fio.
 *
 * ```ts
 * decodeMovementInput(wire, seat.movementInput)
 * armMovementInput(seat.arsenal, seat.movementInput)
 * ```
 */
export function decodeMovementInput(wire: WireInput, into: MutableMovementInput): void {
  const buttons = decodeButtons(wire.buttons)
  into.wishX = wire.wishX / WISH_STEPS
  into.wishZ = wire.wishZ / WISH_STEPS
  into.sprint = buttons.sprint
  into.jump = buttons.jump
  into.crouch = buttons.crouch
  into.grapple = buttons.grapple
  const aim = dequantizeAim(wire, aimVector)
  into.aimX = aim.x
  into.aimY = aim.y
  into.aimZ = aim.z
}

const aimVector: Vector3 = { x: 0, y: 0, z: -1 }

/**
 * As teclas da arma de um tick, a partir do fio, que o servidor passa ao
 * mesmo `stepArsenal` do cliente.
 *
 * ```ts
 * stepArsenal(seat.arsenal, decodeWeaponInput(wire), body, aimM, config, dtS)
 * ```
 */
export function decodeWeaponInput(wire: WireInput): WeaponInput {
  const { fire, scope, aim, reload, melee, primary } = decodeButtons(wire.buttons)
  return { fire, scope, aim, reload, melee, primary }
}

/**
 * Cada kill da sala, de tiro ou de lâmina, do servidor para todos os clientes.
 * O corpo é o `KillEvent` do núcleo: cada cliente passa a mesma lista, na
 * mesma ordem, pelo mesmo `recordKill`, e chega ao mesmo placar e às mesmas
 * medalhas sem o servidor mandar placar nenhum.
 */
export const KILL_MESSAGE = 'match.kill'

/** Uma morte por sair da área de jogo (ADR 0011), do servidor para todos. */
export const BOUNDARY_DEATH_MESSAGE = 'match.boundary-death'

export interface BoundaryDeathMessage {
  readonly playerId: string
}

/**
 * Cada tiro da sala, de humano ou de bot, do servidor para todos: o rastro,
 * o clarão e o som de quem atirou. O atirador humano já desenhou o dele pela
 * predição e ignora o próprio.
 */
export const SHOT_MESSAGE = 'match.shot'

export interface ShotMessage {
  readonly shooterId: string
  readonly fromM: Readonly<Vector3>
  /** Onde o raio parou, em parede, em alguém ou no alcance. */
  readonly toM: Readonly<Vector3>
  /** O raio parou num combatente, e não em parede: o desenho do impacto é outro. */
  readonly hitFighter: boolean
}

/**
 * Do cliente para o servidor: a lâmina da classe que o jogador escolheu
 * (ADR 0021). A katana e a faca andam e investem diferente, e o servidor
 * precisa da mesma para a predição do corpo bater.
 */
export const LOADOUT_MESSAGE = 'loadout.melee'

export interface LoadoutMessage {
  readonly meleeWeapon: MeleeWeapon
}
