import {
  type Arsenal,
  type BoundaryClock,
  type CharacterState,
  createBoundaryClock,
  createMeleeState,
  createSpinTracker,
  createWeaponState,
  DEFAULT_HUMAN_SKIN,
  DEFAULT_PRIMARY_WEAPON,
  DEFAULT_PROFILE_NAME,
  DEFAULT_SNIPER_FINISH,
  type Fighter,
  type GameplayConfig,
  type HumanSkinId,
  IDLE_INPUT,
  type MeleeWeapon,
  type MutableMovementInput,
  type PrimaryWeapon,
  rearmMelee,
  rearmWeapon,
  respawnCharacter,
  type Vector3,
  type WireAim,
  type YawTurnTracker,
} from '@shobu/core'
import { createInputBacklog, type InputBacklog } from './roomInputBacklog.ts'
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
  /** A fila de input na janela que corre; ver `STANDING_BACKLOG_WINDOW_TICKS`. */
  readonly inputBacklog: InputBacklog
  /** O nome de perfil, já limpo; o padrão até o cliente mandar o dele. */
  callsign: string
  /** A arma principal da classe; a padrão até o cliente mandar a dele. */
  primaryWeapon: PrimaryWeapon
  /** A skin do personagem; a padrão até o cliente mandar a dele. */
  characterSkin: HumanSkinId
  /** O id do acabamento da sniper; vazio (o padrão de cada cliente) até ele mandar. */
  sniperFinish: string
  /**
   * A cor do neon, índice da paleta, escolhida pela sala na entrada
   * (`freeSeatAccentOf`) e fixa até a saída: é o que separa dois competidores
   * com a mesma skin.
   */
  accent: number
  /**
   * A página recarregou no mapa novo e a vaga espera a volta (`holdSeatForReload`):
   * o assento fica na sala, fora de jogo (morto, sem relógio de volta), até o
   * cliente reconectar ou a espera vencer.
   */
  away: boolean
  /**
   * A vaga foi expulsa (voto ou anfitrião, ADR 0034). Quem estava longe, na
   * recarga, não tem conexão para a sala fechar, e a reconexão pelo token não
   * passa pelo banimento do matchmaking: é esta marca que recusa a volta.
   */
  expelled: boolean
  /**
   * A vaga voltou da recarga (`seatReturned`), mas a página ainda está no
   * CLIQUE PARA ENTRAR: o lutador segue morto, sem relógio de volta e fora da
   * mira, até o cliente dizer que pegou o controle (`seatTookControl`).
   */
  awaitsControl: boolean
  /**
   * O rtt que o próprio cliente diz ter (`notePing`), em ms: só a coluna do
   * tab. Zero até o primeiro relato.
   */
  pingMs: number
  /**
   * O instante, no relógio da sala, do último input que mudou alguma coisa
   * (`noteSeatInput`): é dele que a inatividade conta.
   */
  activeAtS: number
  /** O que a sala já disse ao inativo: nada, o aviso, ou a saída (`stepRoomAfk`). */
  idleNotice: IdleNotice
  /** O giro da mira nos últimos segundos, para o `360-no-scope` (`noteYaw`). */
  readonly spin: YawTurnTracker
  /** O instante da entrada, no relógio da sala: quem acabou de entrar não abre voto de expulsão. */
  seatedAtS: number
  /**
   * A chave do aparelho, da reserva do assento (`parseDeviceKey`); vazia sem
   * ela. É o que o banimento da sala guarda quando o voto expulsa (ADR 0034).
   */
  deviceKey: string
}

/** O passo da inatividade em que o assento está: cada um sai uma vez só. */
export type IdleNotice = 'active' | 'warned' | 'kicked'

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
    inputBacklog: createInputBacklog(),
    ...defaultSeatChoices(),
    away: false,
    expelled: false,
    awaitsControl: false,
    ...freshSeatPresence(),
    spin: createSpinTracker(config),
  }
}

/** A presença de quem acabou de chegar: sem ping, sem aviso, sem chave do aparelho. */
function freshSeatPresence(): Pick<
  RoomSeat,
  'pingMs' | 'activeAtS' | 'idleNotice' | 'seatedAtS' | 'deviceKey'
> {
  return { pingMs: 0, activeAtS: 0, idleNotice: 'active', seatedAtS: 0, deviceKey: '' }
}

/** O que o cliente diz de si antes de dizer: o nome, a arma e o visual padrão. */
function defaultSeatChoices(): Pick<
  RoomSeat,
  'callsign' | 'primaryWeapon' | 'characterSkin' | 'sniperFinish' | 'accent'
> {
  return {
    callsign: DEFAULT_PROFILE_NAME,
    primaryWeapon: DEFAULT_PRIMARY_WEAPON,
    characterSkin: DEFAULT_HUMAN_SKIN,
    sniperFinish: DEFAULT_SNIPER_FINISH,
    accent: 0,
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
