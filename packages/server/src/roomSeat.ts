import {
  type Arsenal,
  type BoundaryClock,
  type CharacterState,
  createBoundaryClock,
  createMeleeState,
  createWeaponState,
  DEFAULT_PRIMARY_WEAPON,
  DEFAULT_PROFILE_NAME,
  type Fighter,
  type GameplayConfig,
  IDLE_INPUT,
  type MeleeWeapon,
  type MutableMovementInput,
  type PrimaryWeapon,
  rearmMelee,
  rearmWeapon,
  respawnCharacter,
  type Vector3,
  type WireAim,
} from '@shobu/core'
import type { RoomRules } from './roomSimulation.ts'

/**
 * Um jogador da sala: o lutador, a arma e a lâmina, o input do tick e o
 * crédito de input. A mira viaja já quantizada e volta igual para os outros.
 */
export interface RoomSeat {
  readonly fighter: Fighter & { readonly facingM: Vector3 }
  /** O mesmo objeto de `fighter.body`, mutável: é o que `stepCharacter` anda. */
  readonly body: CharacterState
  readonly arsenal: Arsenal
  readonly movementInput: MutableMovementInput
  readonly boundary: BoundaryClock
  /** A mira do último input, como chegou do fio. */
  aim: WireAim
  /** A mesma mira, unitária, em metros: de onde o tiro e o golpe saem. */
  readonly aimM: Vector3
  readonly eyeM: Vector3
  /** Mortes por sair da área: escolhem o spawn, como no cliente (`respawnOutOfBounds`). */
  boundaryDeaths: number
  /** Quantos inputs o jogador ainda pode aplicar; ver `INPUT_CREDIT_CAP`. */
  inputCredits: number
  /** O nome de perfil, já limpo; o padrão até o cliente mandar o dele. */
  callsign: string
  /** A arma principal da classe; a padrão até o cliente mandar a dele. */
  primaryWeapon: PrimaryWeapon
  /**
   * A página recarregou no mapa novo e a vaga espera a volta (`holdSeatForReload`):
   * o assento fica na sala, parado, até o cliente reconectar ou a espera vencer.
   */
  away: boolean
  /**
   * O rtt que o próprio cliente diz ter (`notePing`), em ms: só a coluna do
   * tab. Zero até o primeiro relato.
   */
  pingMs: number
}

/** Olhando para -z até o primeiro input dizer outra coisa. */
export const FORWARD_AIM: WireAim = { aimX: 0, aimY: 0, aimZ: -32767 }

/**
 * O assento recém-chegado: vivo, parado, olhando para -Z, com o nome e a arma padrão.
 *
 * ```ts
 * const seat = createSeat(playerId, createCharacterState(feetM, config), { meleeWeapon, config })
 * ```
 */
export function createSeat(
  playerId: string,
  body: CharacterState,
  { meleeWeapon, config }: { readonly meleeWeapon: MeleeWeapon; readonly config: GameplayConfig },
): RoomSeat {
  return {
    fighter: { id: playerId, body, facingM: { x: 0, y: 0, z: -1 }, alive: true, respawnLeftS: 0 },
    body,
    arsenal: { weapon: createWeaponState(config), melee: createMeleeState(meleeWeapon) },
    movementInput: { ...IDLE_INPUT },
    boundary: createBoundaryClock(),
    aim: FORWARD_AIM,
    aimM: { x: 0, y: 0, z: -1 },
    eyeM: { x: 0, y: 0, z: 0 },
    boundaryDeaths: 0,
    inputCredits: 0,
    callsign: DEFAULT_PROFILE_NAME,
    primaryWeapon: DEFAULT_PRIMARY_WEAPON,
    away: false,
    pingMs: 0,
  }
}

/**
 * Corpo, arma, lâmina e contagem da área de volta ao começo, no pé dado.
 *
 * ```ts
 * respawnSeat(seat, spawnFor(room, rules), rules)
 * ```
 */
export function respawnSeat(seat: RoomSeat, feetM: Readonly<Vector3>, rules: RoomRules): void {
  respawnCharacter(seat.body, feetM, rules.config)
  rearmWeapon(seat.arsenal.weapon, rules.config)
  rearmMelee(seat.arsenal.melee)
  seat.boundary.outsideS = 0
}
