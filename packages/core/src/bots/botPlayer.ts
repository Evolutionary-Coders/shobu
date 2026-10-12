import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { Fighter } from '../match/fighter.ts'
import { createSeededRandom, type SeededRandom } from '../math/seededRandom.ts'
import type { Vector3 } from '../math/vector3.ts'
import { createMeleeState, type MeleeState, rearmMelee } from '../melee/meleeState.ts'
import {
  type CharacterState,
  copyCharacterState,
  createCharacterState,
} from '../movement/characterState.ts'
import { IDLE_INPUT } from '../movement/movementInput.ts'
import { IDLE_WEAPON_INPUT, type WeaponInput } from '../weapon/weaponInput.ts'
import { createWeaponState, rearmWeapon, type WeaponState } from '../weapon/weaponState.ts'
import {
  type BotLocomotion,
  createBotLocomotion,
  type MutableMovementInput,
} from './botLocomotion.ts'
import type { NavGraph } from './navGraph.ts'

export type MutableWeaponInput = { -readonly [Key in keyof WeaponInput]: WeaponInput[Key] }

/**
 * A cabeça do bot entre um tick e o seguinte: quem ele está mirando, há
 * quanto tempo, e para que lado ele dá o passo lateral. Tudo número, para o
 * estado inteiro do bot caber num snapshot quando o servidor existir.
 */
export interface BotMind {
  /** Índice do alvo na lista de combatentes, ou -1. */
  targetIndex: number
  /** Há quanto tempo o alvo atual está à vista. É o relógio da reação e da mira. */
  targetSeenS: number
  /**
   * A reação deste alvo: sorteada a cada aquisição entre `reactionS` e
   * `reactionS + reactionSpreadS` do nível. Reação fixa é metrônomo, e o
   * jogador aprende metrônomo.
   */
  reactionS: number
  /**
   * Quem atirou perto do bot (`noticeShot`), ou -1. No próximo olhar ele
   * procura esse primeiro — se o enxergar; ouvir o tiro não é ver o atirador.
   */
  threatIndex: number
  /** O que falta do susto de um quase-tiro, com a mira tremida. */
  flinchLeftS: number
  /** Há quanto tempo o alvo está ao alcance da faca. É o relógio de `meleeReactionS`. */
  inReachS: number
  /** Até o próximo olhar em volta. O bot não reavalia todo mundo a cada tick. */
  lookAroundLeftS: number
  /** Para onde a mira erra, numa bola de raio 1: sorteado a cada alvo e a cada tiro (`botAim.ts`). */
  readonly aimJitter: Vector3
  /** 1 ou -1: o lado do passo lateral de quem troca tiro. */
  strafeSign: number
  strafeLeftS: number
}

/**
 * Um bot: o mesmo corpo, a mesma arma e o mesmo lugar na lista de combatentes
 * que um jogador. O que ele tem a mais é cabeça e pernas — e o gerador
 * próprio, semeado, para cada decisão dele ser reproduzível (ADR 0003).
 */
export interface BotPlayer extends Fighter {
  readonly callsign: string
  readonly body: CharacterState
  /** O corpo do tick anterior: o render desenha a mistura dos dois. */
  readonly previousBody: CharacterState
  readonly weapon: WeaponState
  /** A faca: o bot não empunha a katana, só golpeia de perto (ADR 0021). */
  readonly melee: MeleeState
  readonly locomotion: BotLocomotion
  readonly mind: BotMind
  readonly movementInput: MutableMovementInput
  readonly weaponInput: MutableWeaponInput
  /** O olho deste tick. Rascunho do próprio bot, reescrito antes de mirar. */
  readonly eyeM: Vector3
  /** Para onde o bot olha, unitário. O tiro sai por aqui; o render vira o corpo para cá. */
  readonly aimM: Vector3
  readonly rng: SeededRandom
}

export interface BotIdentity {
  readonly id: string
  readonly callsign: string
  readonly seed: number
}

/**
 * Um bot parado no pé pedido, vivo, de arma pronta e sem rota. Quem lhe dá
 * destino é `placeBot`.
 *
 * ```ts
 * const bot = createBotPlayer({ id: 'bot-0', callsign: 'ONRYO', seed: 7 }, feetM, graph, config)
 * ```
 */
export function createBotPlayer(
  identity: BotIdentity,
  feetM: Readonly<Vector3>,
  graph: NavGraph,
  config: GameplayConfig,
): BotPlayer {
  const aimM = { x: 0, y: 0, z: 1 }
  return {
    id: identity.id,
    callsign: identity.callsign,
    body: createCharacterState(feetM, config),
    previousBody: createCharacterState(feetM, config),
    weapon: createWeaponState(config),
    melee: createMeleeState('knife'),
    locomotion: createBotLocomotion(graph),
    mind: createBotMind(),
    movementInput: { ...IDLE_INPUT },
    weaponInput: { ...IDLE_WEAPON_INPUT },
    eyeM: { x: 0, y: 0, z: 0 },
    aimM,
    // o bot olha para onde mira: o mesmo vetor, e não uma cópia a manter.
    facingM: aimM,
    rng: createSeededRandom(identity.seed),
    alive: true,
    respawnLeftS: 0,
  }
}

function createBotMind(): BotMind {
  return {
    targetIndex: -1,
    targetSeenS: 0,
    reactionS: 0,
    threatIndex: -1,
    flinchLeftS: 0,
    inReachS: 0,
    lookAroundLeftS: 0,
    aimJitter: { x: 0, y: 0, z: 0 },
    strafeSign: 1,
    strafeLeftS: 0,
  }
}

/**
 * Põe o bot de pé num pé novo, como quem nasce: corpo de nascimento no tick
 * atual **e** no anterior (senão o render o veria voar do lugar da morte até
 * o spawn), arma pronta e cabeça sem alvo. Aloca um estado, e só aqui: é
 * evento de segundos, fora do caminho quente.
 */
export function resetBotBody(
  bot: BotPlayer,
  feetM: Readonly<Vector3>,
  config: GameplayConfig,
): void {
  const born = createCharacterState(feetM, config)
  copyCharacterState(born, bot.body)
  copyCharacterState(born, bot.previousBody)
  rearmWeapon(bot.weapon, config)
  rearmMelee(bot.melee)
  Object.assign(bot.movementInput, IDLE_INPUT)
  Object.assign(bot.weaponInput, IDLE_WEAPON_INPUT)
  bot.mind.targetIndex = -1
  bot.mind.targetSeenS = 0
  bot.mind.lookAroundLeftS = 0
  bot.mind.threatIndex = -1
  bot.mind.flinchLeftS = 0
  bot.mind.inReachS = 0
}
