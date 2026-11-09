import {
  aimAndTrigger,
  armRapidBolt,
  type BotPlayer,
  clearOwnTimedEffects,
  closeScope,
  creditScorestreakKill,
  describeMeleeKill,
  describeSniperKill,
  eyeOf,
  type Fighter,
  type GameplayConfig,
  killFighter,
  type MedalAward,
  type MeleeWeapon,
  type MutableKillEvent,
  moveBot,
  noticeShot,
  pickSpawn,
  placeBot,
  type RoomMedal,
  rearmMelee,
  rearmWeapon,
  recordAwardedKill,
  recordKill,
  resolveFighterShot,
  resolveFighterStrike,
  roomMedalAwards,
  type Scoreboard,
  stepRespawnClock,
  type Vector3,
  type WeaponState,
  yawTurnWithin,
} from '@shobu/core'
import { copyKillNotice, noteKill, noteTracer } from './arenaFrameLog.ts'
import type { ArenaParts } from './arenaParts.ts'
import type { ArenaFrame, ArenaSessionClocks, ArenaSessionOptions } from './arenaSession.ts'

/**
 * O combate de um tick: o tiro do jogador, os bots, as kills e os respawns.
 * Mora fora de `arenaSession.ts` para a sessão ficar com a **ordem** do tick e
 * este módulo com o que acontece em cada passo dela.
 *
 * Toda kill passa por `scoreKill`, seja quem for o atirador e a vítima, de
 * tiro ou de lâmina: é o mesmo `recordKill` do núcleo, as mesmas medalhas e o
 * mesmo placar (ADR 0016).
 */
export interface TickCombat {
  readonly session: ArenaSessionClocks
  readonly options: ArenaSessionOptions
  readonly parts: ArenaParts
  readonly frame: Readonly<ArenaFrame>
}

/** O que uma kill mexe: a sessão, as opções e as peças. O quadro não entra. */
export type CombatScope = Pick<TickCombat, 'session' | 'options' | 'parts'>

/** O índice do jogador local na lista de combatentes: o primeiro, sempre. */
const LOCAL_INDEX = 0

/**
 * O olho do corpo **neste tick**, e não o da câmera, que é o do quadro anterior
 * interpolado: é dele que o servidor atira (`eyeOf(seat.body)`), e o mesmo
 * raio é o que deixa o acerto previsto concordar com o dele. A correção de
 * 2222f14 se perdeu na mescla 9e99f9d.
 */
function tickEye(combat: TickCombat): Readonly<Vector3> {
  return eyeOf(combat.options.character.current, combat.parts.tickEyeM)
}

/**
 * O tiro do jogador, do olho do tick na direção da câmera, contra os bots.
 * O contador de tiros **é** a identidade do tiro: semeia a dispersão, e
 * quando o servidor existir `seedBase` vem dele e o cliente chega ao mesmo
 * cone sem mais nenhuma mudança.
 */
export function tryLocalShot(combat: TickCombat): void {
  const { parts, frame } = combat
  const eyeM = tickEye(combat)
  const victim = resolveFighterShot(
    {
      shooterIndex: LOCAL_INDEX,
      eyeM,
      aimM: frame.aimM,
      weapon: parts.weapon,
      seedBase: parts.seedBase,
    },
    parts.fighters,
    parts.range,
    parts.shot,
  )
  warnBotsOfShot(combat, LOCAL_INDEX, eyeM)
  // online o acerto é do servidor: a kill chega pela sala (`arenaOnline.ts`).
  if (victim >= 0 && !parts.online) landShotKill(combat, LOCAL_INDEX, victim, parts.weapon)
}

/**
 * O golpe do jogador, do olho do tick na direção da câmera, com a arma do
 * slot da classe. Mesmo caminho do golpe do bot (`resolveFighterStrike`).
 */
export function tryLocalStrike(combat: TickCombat): void {
  const { parts, frame } = combat
  strikeFrom(combat, LOCAL_INDEX, tickEye(combat), frame.aimM, parts.melee.weapon)
}

function strikeFrom(
  combat: TickCombat,
  strikerIndex: number,
  eyeM: Readonly<Vector3>,
  aimM: Readonly<Vector3>,
  weapon: MeleeWeapon,
): void {
  const { parts } = combat
  const hit = parts.meleeHit
  const victim = resolveFighterStrike(
    { strikerIndex, eyeM, aimM, weapon },
    parts.fighters,
    parts.strikeRange,
    hit,
  )
  if (victim < 0 || parts.online) return
  const kill = describeMeleeKill(parts.kill, {
    striker: parts.fighters[strikerIndex] as Fighter,
    victim: parts.fighters[victim] as Fighter,
    weapon,
    hit,
    atS: combat.session.matchTimeS,
  })
  scoreKill(combat, strikerIndex, victim, kill)
}

/**
 * Morto, o jogador só espera: a câmera está parada onde ele caiu
 * (`holdStill`). No tick em que o relógio zera, ele volta num spawn sorteado,
 * de arma pronta e com controle total — o respawn do GDD.
 */
export function stepLocalRespawn(combat: TickCombat): void {
  const { session, options, parts } = combat
  if (!stepRespawnClock(parts.local, options.character.tickDurationS)) return
  const spawn = pickSpawn(parts.respawns, parts.fighters, parts.rng)
  options.character.respawnAt(parts.respawns[spawn] as Readonly<Vector3>)
  rearmWeapon(parts.weapon, options.config)
  // quem renasce volta com a sniper na mão (ADR 0021).
  rearmMelee(parts.melee)
  session.killedBy = null
}

/**
 * Os bots, um de cada vez, cada um na ordem do jogador: arma, tiro, corpo. O
 * bot de índice `i` é o combatente `i + 1` — o jogador local é o zero.
 */
export function stepBots(combat: TickCombat): void {
  const { parts } = combat
  const bots = parts.squad.bots
  for (let index = 0; index < bots.length; index += 1) {
    stepBot(combat, bots[index] as BotPlayer, index)
  }
}

function stepBot(combat: TickCombat, bot: BotPlayer, botIndex: number): void {
  const { parts, options } = combat
  if (!bot.alive) {
    if (stepRespawnClock(bot, parts.botTick.dtS)) {
      placeBot(parts.squad, bot, parts.fighters, options.config)
    }
    return
  }
  const fighterIndex = botIndex + 1
  armRapidBolt(bot.weapon, parts.scorestreakEffects, bot.id, combat.session.matchTimeS)
  if (aimAndTrigger(bot, fighterIndex, parts.botTick)) fireBot(combat, bot, botIndex)
  if (bot.melee.struckThisTick) {
    strikeFrom(combat, fighterIndex, bot.eyeM, bot.aimM, bot.melee.weapon)
  }
  moveBot(bot, parts.botTick)
}

function fireBot(combat: TickCombat, bot: BotPlayer, botIndex: number): void {
  const { parts } = combat
  const fighterIndex = botIndex + 1
  const victim = resolveFighterShot(
    {
      shooterIndex: fighterIndex,
      eyeM: bot.eyeM,
      aimM: bot.aimM,
      weapon: bot.weapon,
      seedBase: parts.seedBase,
    },
    parts.fighters,
    parts.range,
    parts.shot,
  )
  noteTracer(parts.tracers, botIndex, bot.eyeM, parts.shot.endpointM, victim >= 0)
  warnBotsOfShot(combat, fighterIndex, bot.eyeM)
  if (victim >= 0) landShotKill(combat, fighterIndex, victim, bot.weapon)
}

/**
 * Todo bot vivo ouve o tiro que acabou de cruzar a arena: o que passou perto
 * dele o assusta e o faz procurar o atirador (`noticeShot`). Vale para o tiro
 * do jogador e para o dos bots, que é FFA. Antes da kill, para quem morreu do
 * tiro não contar — e quem morreu ignora de qualquer jeito.
 */
function warnBotsOfShot(combat: TickCombat, shooterIndex: number, fromM: Readonly<Vector3>): void {
  const { parts, options } = combat
  const passing = parts.passingShot
  passing.shooterIndex = shooterIndex
  Object.assign(passing.fromM, fromM)
  Object.assign(passing.toM, parts.shot.endpointM)
  const bots = parts.squad.bots
  for (let index = 0; index < bots.length; index += 1) {
    noticeShot(bots[index] as BotPlayer, index + 1, passing, options.config.bots)
  }
}

/** A kill de um tiro: a resolução de acerto descreve o evento, e o placar o recebe. */
function landShotKill(
  combat: TickCombat,
  shooterIndex: number,
  victimIndex: number,
  weapon: Readonly<WeaponState>,
): void {
  const { session, parts, options } = combat
  const atS = session.matchTimeS
  const spinWindowS = options.config.medals.spinWindowS
  const kill = describeSniperKill(parts.kill, {
    shooter: parts.fighters[shooterIndex] as Fighter,
    victim: parts.fighters[victimIndex] as Fighter,
    shot: parts.shot,
    weapon,
    atS,
    yawTurnDeg: shooterIndex === LOCAL_INDEX ? yawTurnWithin(parts.spin, atS, spinWindowS) : 0,
  })
  scoreKill(combat, shooterIndex, victimIndex, kill)
}

/**
 * Uma kill, venha de quem vier e com a arma que for: a vítima morre e arma o
 * respawn, e o placar recebe medalhas e pontos pelo `recordKill` do núcleo.
 * As medalhas do jogador vão para a tela; as dos bots pontuam igual e ninguém
 * as anuncia. Online, `roomMedals` são as que a sala concedeu (ADR 0031), e
 * o placar local não decide medalha nenhuma: ele só viu as kills desde que
 * este cliente entrou.
 *
 * Quando a vítima é o jogador, a câmera congela onde ele caiu e a sessão
 * guarda quem o matou, para a tela dizer.
 */
export function scoreKill(
  combat: CombatScope,
  shooterIndex: number,
  victimIndex: number,
  kill: Readonly<MutableKillEvent>,
  roomMedals?: readonly RoomMedal[],
): void {
  const { options, parts } = combat
  const shooter = parts.fighters[shooterIndex] as Fighter
  // a vítima está viva: o tiro e o golpe só miram em quem está, e quem morreu
  // neste tick já saiu da lista do seguinte.
  killFighter(parts.fighters[victimIndex] as Fighter, options.config.match.respawnDelayS)
  const medals = shooterIndex === LOCAL_INDEX ? parts.medals : parts.botMedals
  recordKillMedals(parts.scoreboard, kill, options.config, medals, roomMedals)
  // online quem ganha série é a sala: o cliente só segue o que ela avisa.
  if (!parts.online) creditScorestreakOf(parts, kill, options.config)
  const headshotRatio = options.config.medals.headshotHeightRatio
  noteKill(parts.kills, kill, headshotRatio)
  if (victimIndex !== LOCAL_INDEX) return
  copyKillNotice(combat.session.deathCause, kill, headshotRatio)
  freezeLocalDeath(combat, shooter.id)
}

/**
 * As medalhas que a sala mandou, quando mandou; sem elas — offline, ou um
 * servidor de antes delas irem no fio — o placar local decide.
 */
function recordKillMedals(
  board: Scoreboard,
  kill: Readonly<MutableKillEvent>,
  config: GameplayConfig,
  medals: MedalAward[],
  roomMedals: readonly RoomMedal[] | undefined,
): void {
  const awarded: MedalAward[] = []
  if (roomMedalAwards(roomMedals, awarded)) {
    recordAwardedKill(board, kill, config, awarded, medals)
    return
  }
  recordKill(board, kill, config, medals)
}

/**
 * A kill offline paga as séries do atirador e devolve a vida nova da vítima,
 * sem os efeitos do corpo.
 */
function creditScorestreakOf(
  parts: ArenaParts,
  kill: Readonly<MutableKillEvent>,
  config: GameplayConfig,
): void {
  const { scorestreaks, scoreboard, scorestreakNotices } = parts
  creditScorestreakKill(scorestreaks, scoreboard, kill, config.scorestreaks, scorestreakNotices)
  clearOwnTimedEffects(parts.scorestreakEffects, kill.victimId)
}

/**
 * A câmera congela onde o jogador caiu, a sessão guarda quem o matou, e a
 * contagem fora da área some: morto não está fora de lugar nenhum.
 *
 * A luneta fecha **aqui**, e não no respawn: o tick do jogador morto não anda
 * a arma, e quem morria mirando via a tela de morte inteira pela luneta (11/10).
 * O aviso de alcance do gancho apaga pelo mesmo motivo: o tick morto não o
 * recalcula.
 */
function freezeLocalDeath(combat: CombatScope, killerId: string): void {
  const { session, options, parts } = combat
  options.character.holdStill()
  closeScope(parts.weapon)
  session.grappleInReach = false
  session.killedBy = killerId
  parts.boundary.outsideS = 0
  session.boundaryRemainingS = null
}
