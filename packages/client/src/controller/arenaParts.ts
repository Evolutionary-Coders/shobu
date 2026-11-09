import type { BotTick, HumanSkinId } from '@shobu/core'
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
  createSpinTracker,
  createTargetList,
  createWeaponState,
  DEFAULT_PRIMARY_WEAPON,
  DEFAULT_PROFILE_NAME,
  type Fighter,
  isBenched,
  MATCH_SEED_BASE,
  type MedalAward,
  type MeleeHit,
  type MeleeState,
  type MutableKillEvent,
  type PrimaryWeapon,
  type Scoreboard,
  type ScorestreakEffects,
  type ScorestreakLedger,
  type ScorestreakNotice,
  type SeededRandom,
  type ShotHit,
  type ShotRange,
  type StrikeRange,
  spreadTangent,
  type Vector3,
  type WeaponState,
  type YawTurnTracker,
} from '@shobu/core'
import {
  type BotTracer,
  createKillLog,
  createTracerLog,
  type FrameLog,
  type KillNotice,
} from './arenaFrameLog.ts'
import { createPuppetSeats, type PuppetSeats } from './arenaOnline.ts'
import { type ArenaRadar, createArenaRadar } from './arenaRadar.ts'
import { createArenaScorestreakParts } from './arenaScorestreaks.ts'
import type { ArenaSessionOptions } from './arenaSession.ts'
import { type CompetitorLooks, createCompetitorLooks } from './competitorLooks.ts'
import type { LocalCharacter } from './localCharacter.ts'
import type { RoomPing } from './officialScores.ts'
import type { ScorestreakTrigger } from './scorestreakTrigger.ts'

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
  /** O giro da mira do jogador, para o `360-no-scope`; o bot não gira. */
  readonly spin: YawTurnTracker
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
  /** O olho do corpo no tick, de onde o tiro e o golpe saem. Rascunho. */
  readonly tickEyeM: Vector3
  /** O tiro que os bots ouvem passar (`noticeShot`). Rascunho reescrito a cada tiro. */
  readonly passingShot: { shooterIndex: number; readonly fromM: Vector3; readonly toM: Vector3 }
  /**
   * A sala do servidor está conectada (`arenaOnline.ts`): as vagas dos bots
   * são os outros jogadores, e o acerto e o respawn são do servidor. Começa
   * falso: sem servidor, a arena joga sozinha com os bots locais.
   */
  online: boolean
  /**
   * Quantos bots a partida senta sem servidor: o BOTS do menu. Online as vagas
   * são da sala, e é com este número que os bots locais voltam se ela cair.
   */
  botCount: number
  /**
   * Se a partida do menu acaba no relógio (`MatchRules.timed`): é com ele que
   * o ciclo offline recomeça, também quando a sala cai.
   */
  timed: boolean
  /** Quem da sala ocupa cada vaga de bot, online (`arenaOnline.ts`). */
  readonly seats: PuppetSeats
  /**
   * A sala zera o registro do quadro, e não o `advance` (`clearFrameLogs`):
   * liga na primeira chamada de `followRoom`, que roda todo quadro quando há
   * rede, com a arena parada ou não.
   */
  followsRoom: boolean
  /**
   * O nome de cada combatente pelo id da sessão: o perfil do jogador, o apelido
   * de cada bot e, online, o nome de quem ocupa cada vaga (`arenaOnline.ts`).
   */
  readonly names: Map<string, string>
  /**
   * A arma principal de cada combatente pelo id da sessão: a do jogador local,
   * da classe, e online a de quem ocupa cada vaga. Quem não está aqui (o bot
   * offline, a vaga que voltou a ser bot) carrega a padrão (`primaryWeaponOf`).
   */
  readonly primaries: Map<string, PrimaryWeapon>
  /**
   * O visual de cada combatente pelo id da sessão (`competitorLooks.ts`): o do
   * jogador local, da classe; online, o que a sala diz de cada vaga; e a conta
   * offline para os bots locais.
   */
  readonly looks: CompetitorLooks
  /**
   * O ping de cada combatente pelo id da sessão, como a sala o traz
   * (`officialScores.ts`). Só vale online: offline fica o da última sala, e
   * ninguém o lê (`pingOf`).
   */
  readonly pings: Map<string, RoomPing>
  /** O aperto de série que teclado, controle e toque armam, e o tick lê (ADR 0029). */
  readonly scorestreakTrigger: ScorestreakTrigger
  /** As séries de todos, no livro do núcleo (`arenaScorestreaks.ts`). */
  readonly scorestreaks: ScorestreakLedger
  /** O que aconteceu com as séries neste quadro, de qualquer um. Zerado como as kills. */
  readonly scorestreakNotices: ScorestreakNotice[]
  /** Os efeitos das séries de todos (`scorestreakEffects.ts`), ligados pelos avisos. */
  readonly scorestreakEffects: ScorestreakEffects
  /** O PING, o embaralhamento e os pontos do minimapa (`arenaRadar.ts`, ADR 0035). */
  readonly radar: ArenaRadar
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
    ...offlineRoom(squad),
    ...identitiesOf(squad, options.playerSkin),
    ...createArenaScorestreakParts(squad, seedBase),
    radar: createArenaRadar(),
    rng: createSeededRandom(seedBase ^ 0x5bd1_e995),
    respawns,
    botTick: { squad, fighters, config: options.config, dtS: options.character.tickDurationS },
  }
}

/** Quem é quem: o nome, a arma principal e o visual de cada combatente. */
function identitiesOf(
  squad: BotSquad,
  playerSkin: HumanSkinId | undefined,
): Pick<ArenaParts, 'names' | 'primaries' | 'looks'> {
  const botIds = squad.bots.map((bot) => bot.id)
  return {
    names: namesOf(squad),
    primaries: new Map(),
    looks: createCompetitorLooks(botIds, playerSkin),
  }
}

/** A arena sem servidor, como o boot a monta: os bots sentados são os da sala. */
function offlineRoom(
  squad: BotSquad,
): Pick<ArenaParts, 'online' | 'botCount' | 'timed' | 'seats' | 'followsRoom' | 'pings'> {
  return {
    online: false,
    timed: false,
    botCount: squad.bots.filter((bot) => !isBenched(bot)).length,
    seats: createPuppetSeats(squad.bots.length),
    followsRoom: false,
    pings: new Map(),
  }
}

/**
 * Zera o registro do quadro (medalhas, kills, rastros e avisos de série). Quem zera é quem roda
 * primeiro em todo quadro: a sala (`followRoom`), quando há rede, e o
 * `advance`, sem ela. Zerado só no `advance`, o que a sala anotava antes dele
 * sumia (14/10); zerado só quando os dois rodavam, com a arena parada no menu
 * o `advance` não roda, e a tela reprisava as mesmas kills a cada quadro.
 *
 * ```ts
 * clearFrameLogs(parts) // no começo de followRoom, ou de advance sem sala
 * ```
 */
export function clearFrameLogs(parts: ArenaParts): void {
  // as medalhas do quadro inteiro, e não só do último tick: `recordKill`
  // acrescenta, e é só aqui que elas começam do zero.
  parts.medals.length = 0
  parts.botMedals.length = 0
  parts.kills.count = 0
  parts.tracers.count = 0
  parts.scorestreakNotices.length = 0
}

/**
 * A arma principal de um id do placar, ou a padrão para quem não escolheu.
 *
 * ```ts
 * primaryWeaponOf(parts, 'bot-0') // 'laser', offline
 * ```
 */
export function primaryWeaponOf(parts: ArenaParts, playerId: string): PrimaryWeapon {
  return parts.primaries.get(playerId) ?? DEFAULT_PRIMARY_WEAPON
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
    spin: createSpinTracker(options.config),
    kills: createKillLog(FRAME_LOG_CAPACITY),
    tracers: createTracerLog(FRAME_LOG_CAPACITY),
    boundary: createBoundaryClock(),
    reachAnchor: { x: 0, y: 0, z: 0 },
    tickEyeM: { x: 0, y: 0, z: 0 },
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
