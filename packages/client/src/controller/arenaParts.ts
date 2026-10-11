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
  createScoreboard,
  createSeededRandom,
  createShotHit,
  createTargetList,
  createWeaponState,
  type Fighter,
  type MedalAward,
  type MutableKillEvent,
  type Scoreboard,
  type SeededRandom,
  type ShotHit,
  type ShotRange,
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
import type { ArenaSessionOptions } from './arenaSession.ts'
import type { LocalCharacter } from './localCharacter.ts'

/** O id do jogador local no placar. Opaco: amanhã é o sessionId do colyseus. */
export const LOCAL_PLAYER_ID = 'local'
const DEFAULT_SEED_BASE = 20_251_119

/**
 * O estado que o tick muta, junto e nomeado, para o passo ser **função de
 * módulo** e não closure: closure de 60 linhas é o que fazia esta raiz crescer,
 * e função nomeada é o que deixa cada pedaço aparecer na conta de cobertura.
 */
export interface ArenaParts {
  readonly weapon: WeaponState
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
}

/** Três bots num quadro de seis ticks, mais folga: o registro nunca enche na prática. */
const FRAME_LOG_CAPACITY = 32

export function createArenaParts(options: ArenaSessionOptions): ArenaParts {
  const seedBase = options.seedBase ?? DEFAULT_SEED_BASE
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
    rng: createSeededRandom(seedBase ^ 0x5bd1_e995),
    respawns,
    botTick: { squad, fighters, config: options.config, dtS: options.character.tickDurationS },
  }
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
    weapon: createWeaponState(options.config),
    scoreboard: createScoreboard(),
    range: {
      boxes: options.boxes,
      config: options.config,
      // a tangente do cone sai uma vez por carga de config, nunca por tiro.
      coneTangent: spreadTangent(options.config.weapon.noScopeSpreadDeg),
      targets: createTargetList(fighterCount),
    },
    shot: createShotHit(),
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

/** Sem spawn, a primeira saída do mapa não teria para onde mandar o jogador. */
function requireRespawns(respawnFeetM: readonly Readonly<Vector3>[]): readonly Readonly<Vector3>[] {
  if (respawnFeetM.length === 0) {
    throw new RangeError('respawnFeetM recebeu []; esperado pelo menos um pé de spawn {x, y, z}')
  }
  return respawnFeetM
}
