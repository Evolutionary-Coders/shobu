import {
  aimAndTrigger,
  type BotPlayer,
  describeMeleeKill,
  describeSniperKill,
  type Fighter,
  killFighter,
  type MeleeWeapon,
  type MutableKillEvent,
  moveBot,
  noticeShot,
  pickSpawn,
  placeBot,
  rearmMelee,
  rearmWeapon,
  recordKill,
  resolveFighterShot,
  resolveFighterStrike,
  stepRespawnClock,
  type Vector3,
  type WeaponState,
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

/** O índice do jogador local na lista de combatentes: o primeiro, sempre. */
const LOCAL_INDEX = 0

/**
 * O tiro do jogador, do olho do quadro na direção da câmera, contra os bots.
 * O contador de tiros **é** a identidade do tiro: semeia a dispersão, e
 * quando o servidor existir `seedBase` vem dele e o cliente chega ao mesmo
 * cone sem mais nenhuma mudança.
 */
export function tryLocalShot(combat: TickCombat): void {
  const { parts, frame } = combat
  const victim = resolveFighterShot(
    {
      shooterIndex: LOCAL_INDEX,
      eyeM: frame.eyeM,
      aimM: frame.aimM,
      weapon: parts.weapon,
      seedBase: parts.seedBase,
    },
    parts.fighters,
    parts.range,
    parts.shot,
  )
  warnBotsOfShot(combat, LOCAL_INDEX, frame.eyeM)
  if (victim >= 0) landShotKill(combat, LOCAL_INDEX, victim, parts.weapon)
}

/**
 * O golpe do jogador, do olho do quadro na direção da câmera, com a arma do
 * slot da classe. Mesmo caminho do golpe do bot (`resolveFighterStrike`).
 */
export function tryLocalStrike(combat: TickCombat): void {
  const { parts, frame } = combat
  strikeFrom(combat, LOCAL_INDEX, frame.eyeM, frame.aimM, parts.melee.weapon)
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
  if (victim < 0) return
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
  if (aimAndTrigger(bot, fighterIndex, parts.botTick)) fireBot(combat, bot, botIndex)
  if (bot.melee.struckThisTick) strikeFrom(combat, fighterIndex, bot.eyeM, bot.aimM, 'knife')
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
  noteTracer(parts.tracers, botIndex, bot.eyeM, parts.shot.endpointM)
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
  const { session, parts } = combat
  const kill = describeSniperKill(parts.kill, {
    shooter: parts.fighters[shooterIndex] as Fighter,
    victim: parts.fighters[victimIndex] as Fighter,
    shot: parts.shot,
    weapon,
    atS: session.matchTimeS,
  })
  scoreKill(combat, shooterIndex, victimIndex, kill)
}

/**
 * Uma kill, venha de quem vier e com a arma que for: a vítima morre e arma o
 * respawn, e o placar recebe medalhas e pontos pelo `recordKill` do núcleo.
 * As medalhas do jogador vão para a tela; as dos bots pontuam igual e ninguém
 * as anuncia.
 *
 * Quando a vítima é o jogador, a câmera congela onde ele caiu e a sessão
 * guarda quem o matou, para a tela dizer.
 */
function scoreKill(
  combat: TickCombat,
  shooterIndex: number,
  victimIndex: number,
  kill: Readonly<MutableKillEvent>,
): void {
  const { options, parts } = combat
  const shooter = parts.fighters[shooterIndex] as Fighter
  // a vítima está viva: o tiro e o golpe só miram em quem está, e quem morreu
  // neste tick já saiu da lista do seguinte.
  killFighter(parts.fighters[victimIndex] as Fighter, options.config.match.respawnDelayS)
  const medals = shooterIndex === LOCAL_INDEX ? parts.medals : parts.botMedals
  recordKill(parts.scoreboard, kill, options.config, medals)
  const headshotRatio = options.config.medals.headshotHeightRatio
  noteKill(parts.kills, kill, headshotRatio)
  if (victimIndex !== LOCAL_INDEX) return
  copyKillNotice(combat.session.deathCause, kill, headshotRatio)
  freezeLocalDeath(combat, shooter.id)
}

/**
 * A câmera congela onde o jogador caiu, a sessão guarda quem o matou, e a
 * contagem fora da área some: morto não está fora de lugar nenhum.
 */
function freezeLocalDeath(combat: TickCombat, killerId: string): void {
  const { session, options, parts } = combat
  options.character.holdStill()
  session.killedBy = killerId
  parts.boundary.outsideS = 0
  session.boundaryRemainingS = null
}
