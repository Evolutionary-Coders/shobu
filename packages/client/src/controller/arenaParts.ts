import type { BotTick } from '@shobu/core'
import {
  addPlayer,
  type BotSquad,
  type BoundaryClock,
  botSeatsFor,
  createBotSquad,
  createBoundaryClock,
  createKillEvent,
  createMedalAwards,
  createMeleeHit,
  createMeleeReach,
  createMeleeState,
  createScoreboard,
  createSeededRandom,
  createShotHit,
  createTargetList,
  createWeaponState,
  DEFAULT_PROFILE_NAME,
  type Fighter,
  MATCH_SEED_BASE,
  type MedalAward,
  type MeleeHit,
  type MeleeState,
  type MutableKillEvent,
  type Scoreboard,
  type SeededRandom,
  type ShotHit,
  type ShotRange,
  type StrikeRange,
  spreadTangent,
  type Vector3,
  type WeaponState,
} from '@shobu/core'
import {
  type BotTracer,
  createKillLog,
  createTracerLog,
  type FrameLog,
  type KillNotice,
} from './arenaFrameLog.ts'
import { createPuppetSeats, type PuppetSeats } from './arenaOnline.ts'
import type { ArenaSessionOptions } from './arenaSession.ts'
import type { LocalCharacter } from './localCharacter.ts'

/** O id do jogador local no placar. Opaco: amanhã é o sessionId do colyseus. */
export const LOCAL_PLAYER_ID = 'local'

/**
 * O estado que o tick muta, junto e nomeado, para o passo ser **função de
 * módulo** e não closure: closure de 60 linhas é o que fazia esta raiz crescer,
 * e função nomeada é o que deixa cada pedaço aparecer na conta de cobertura.
 */
export interface ArenaParts {
  readonly weapon: WeaponState
  /** O slot de corpo a corpo do jogador local: a faca ou a katana da classe (ADR 0021). */
  readonly melee: MeleeState
  readonly strikeRange: StrikeRange
  /** O golpe do tick, de quem for. Rascunho reescrito a cada golpe, como o `shot`. */
  readonly meleeHit: MeleeHit
  readonly local: Fighter
  readonly squad: BotSquad
  readonly fighters: readonly Fighter[]
  readonly scoreboard: Scoreboard
  readonly range: ShotRange
  readonly shot: ShotHit
  readonly kill: MutableKillEvent
  /** As medalhas do jogador local: é o que a tela mostra. */
  readonly medals: MedalAward[]
  /** As dos bots: pontuam igual, mas ninguém as anuncia. */
  readonly botMedals: MedalAward[]
  readonly kills: FrameLog<KillNotice>
  readonly tracers: FrameLog<BotTracer>
  readonly seedBase: number
  /** Os spawns do respawn depois de um tiro: sorteio, como o GDD manda. */
  readonly rng: SeededRandom
  readonly boundary: BoundaryClock
  /** Nunca vazia: `requireRespawns` recusa a lista vazia na criação. */
  readonly respawns: readonly Readonly<Vector3>[]
  readonly botTick: BotTick
  /** Onde o aviso da retícula achou superfície. Rascunho: só o sim ou não importa. */
  readonly reachAnchor: Vector3
  /** O tiro que os bots ouvem passar (`noticeShot`). Rascunho reescrito a cada tiro. */
  readonly passingShot: { shooterIndex: number; readonly fromM: Vector3; readonly toM: Vector3 }
  /**
   * A sala do servidor está conectada (`arenaOnline.ts`): as vagas dos bots
   * são os outros jogadores, e o acerto e o respawn são do servidor. Começa
   * falso: sem servidor, a arena joga sozinha com os bots locais.
   */
  online: boolean
  /** Quem da sala ocupa cada vaga de bot, online (`arenaOnline.ts`). */
  readonly seats: PuppetSeats
  /** O registro do quadro já foi zerado neste quadro (`openFrameLogs`). */
  frameLogsOpen: boolean
  /**
   * O nome de cada combatente pelo id da sessão: o perfil do jogador, o apelido
   * de cada bot e, online, o nome de quem ocupa cada vaga (`arenaOnline.ts`).
   */
  readonly names: Map<string, string>
}

/** Três bots num quadro de seis ticks, mais folga: o registro nunca enche na prática. */
const FRAME_LOG_CAPACITY = 32

export function createArenaParts(options: ArenaSessionOptions): ArenaParts {
  const seedBase = options.seedBase ?? MATCH_SEED_BASE
  const respawns = requireRespawns(options.respawnFeetM)
  const local = createLocalFighter(options.character)
  const squad = enlistBots(options, seedBase, respawns)
  const fighters: readonly Fighter[] = [local, ...squad.bots]
  const scratch = createCombatScratch(options, fighters.length)
  // todo mundo no placar desde a entrada, em zero, na ordem de entrada: o tab
  // mostra a sala inteira antes da primeira kill, e o empate fica nesta ordem.
  for (const fighter of fighters) addPlayer(scratch.scoreboard, fighter.id)
  return {
    ...scratch,
    local,
    squad,
    fighters,
    seedBase,
    online: false,
    seats: createPuppetSeats(squad.bots.length),
    frameLogsOpen: false,
    names: namesOf(squad),
    rng: createSeededRandom(seedBase ^ 0x5bd1_e995),
    respawns,
    botTick: { squad, fighters, config: options.config, dtS: options.character.tickDurationS },
  }
}

/**
 * Zera o registro do quadro (medalhas, kills e rastros) uma vez por quadro,
 * por quem chegar primeiro: a sala (`followRoom`), que roda antes do
 * * `advance`, ou o próprio `advance`, que o fecha para o quadro seguinte. Zerado só
 * no `advance`, o que a sala anotava antes dele sumia (14/10).
 *
 * ```ts
 * openFrameLogs(parts) // no começo de followRoom e de advance
 * ```
 */
export function openFrameLogs(parts: ArenaParts): void {
  if (parts.frameLogsOpen) return
  parts.frameLogsOpen = true
  // as medalhas do quadro inteiro, e não só do último tick: `recordKill`
  // acrescenta, e é só aqui que elas começam do zero.
  parts.medals.length = 0
  parts.botMedals.length = 0
  parts.kills.count = 0
  parts.tracers.count = 0
}

function namesOf(squad: BotSquad): Map<string, string> {
  return new Map([
    [LOCAL_PLAYER_ID, DEFAULT_PROFILE_NAME],
    ...squad.bots.map((bot) => [bot.id, bot.callsign] as const),
  ])
}

function createLocalFighter(character: LocalCharacter): Fighter {
  return {
    id: LOCAL_PLAYER_ID,
    body: character.current,
    // reescrito a cada tick com a câmera do quadro: é o olhar que o `backstab` lê.
    facingM: { x: 0, y: 0, z: 1 },
    alive: true,
    respawnLeftS: 0,
  }
}

/** As vagas que os humanos não ocupam viram bots, que nascem nos mesmos spawns do jogador. */
function enlistBots(
  options: ArenaSessionOptions,
  seedBase: number,
  respawns: readonly Readonly<Vector3>[],
): BotSquad {
  const { config } = options
  return createBotSquad({
    count: botSeatsFor(config.match.playersPerRoom, options.humans ?? 1),
    seed: seedBase,
    arena: { boxes: options.boxes, graph: options.navGraph, spawnsFeetM: respawns },
    config,
  })
}

/** Os rascunhos do combate: reaproveitados por tiro e por kill, nunca recriados. */
function createCombatScratch(options: ArenaSessionOptions, fighterCount: number) {
  return {
    ...createArsenalScratch(options, fighterCount),
    scoreboard: createScoreboard(),
    kill: createKillEvent(),
    medals: createMedalAwards(),
    botMedals: createMedalAwards(),
    kills: createKillLog(FRAME_LOG_CAPACITY),
    tracers: createTracerLog(FRAME_LOG_CAPACITY),
    boundary: createBoundaryClock(),
    reachAnchor: { x: 0, y: 0, z: 0 },
    passingShot: { shooterIndex: -1, fromM: { x: 0, y: 0, z: 0 }, toM: { x: 0, y: 0, z: 0 } },
  }
}

/** As duas armas do jogador local, e o que o tiro e o golpe reaproveitam. */
function createArsenalScratch(options: ArenaSessionOptions, fighterCount: number) {
  const { config, boxes } = options
  return {
    weapon: createWeaponState(config),
    // a katana até o menu dizer outra coisa: é a arma padrão da classe.
    melee: createMeleeState('katana'),
    range: {
      boxes,
      config,
      // a tangente do cone sai uma vez por carga de config, nunca por tiro.
      coneTangent: spreadTangent(config.weapon.noScopeSpreadDeg),
      targets: createTargetList(fighterCount),
    },
    // os cossenos dos arcos também: uma vez por carga, nunca por golpe.
    strikeRange: { boxes, config, reach: createMeleeReach(config) },
    shot: createShotHit(),
    meleeHit: createMeleeHit(),
  }
}

/** Sem spawn, a primeira saída do mapa não teria para onde mandar o jogador. */
function requireRespawns(respawnFeetM: readonly Readonly<Vector3>[]): readonly Readonly<Vector3>[] {
  if (respawnFeetM.length === 0) {
    throw new RangeError('respawnFeetM recebeu []; esperado pelo menos um pé de spawn {x, y, z}')
  }
  return respawnFeetM
}
