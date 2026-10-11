import {
  aimAndTrigger,
  type BotPlayer,
  describeSniperKill,
  type Fighter,
  killFighter,
  moveBot,
  pickSpawn,
  placeBot,
  rearmWeapon,
  recordKill,
  resolveFighterShot,
  stepRespawnClock,
  type Vector3,
  type WeaponState,
} from '@shobu/core'
import { noteKill, noteTracer } from './arenaFrameLog.ts'
import type {
  ArenaFrame,
  ArenaParts,
  ArenaSessionClocks,
  ArenaSessionOptions,
} from './arenaSession.ts'

/**
 * O combate de um tick: o tiro do jogador, os bots, as kills e os respawns.
 * Mora fora de `arenaSession.ts` para a sessão ficar com a **ordem** do tick e
 * este módulo com o que acontece em cada passo dela.
 *
 * Toda kill passa por `landKill`, seja quem for o atirador e a vítima: é o
 * mesmo `recordKill` do núcleo, as mesmas medalhas e o mesmo placar (ADR 0016).
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
  if (victim >= 0) landKill(combat, LOCAL_INDEX, victim, parts.weapon)
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
  if (victim >= 0) landKill(combat, fighterIndex, victim, bot.weapon)
}

/**
 * Uma kill, venha de quem vier: a vítima morre e arma o respawn, o evento é
 * descrito pela resolução de acerto, e o placar recebe medalhas e pontos pelo
 * `recordKill` do núcleo. As medalhas do jogador vão para a tela; as dos bots
 * pontuam igual e ninguém as anuncia.
 *
 * Quando a vítima é o jogador, a câmera congela onde ele caiu e a sessão
 * guarda quem o matou, para a tela dizer.
 */
function landKill(
  combat: TickCombat,
  shooterIndex: number,
  victimIndex: number,
  weapon: Readonly<WeaponState>,
): void {
  const { session, options, parts } = combat
  const shooter = parts.fighters[shooterIndex] as Fighter
  const victim = parts.fighters[victimIndex] as Fighter
  // a vítima está viva: `resolveFighterShot` só mira em quem está, e quem
  // morreu neste tick já saiu da lista do tiro seguinte.
  killFighter(victim, options.config.match.respawnDelayS)
  const kill = describeSniperKill(parts.kill, {
    shooter,
    victim,
    shot: parts.shot,
    weapon,
    atS: session.matchTimeS,
  })
  const medals = shooterIndex === LOCAL_INDEX ? parts.medals : parts.botMedals
  recordKill(parts.scoreboard, kill, options.config, medals)
  noteKill(parts.kills, shooter.id, victim.id)
  if (victimIndex === LOCAL_INDEX) freezeLocalDeath(combat, shooter.id)
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
