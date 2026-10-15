import { readFileSync } from 'node:fs'
import {
  arenaCollisionBoxes,
  type BotPlayer,
  ICHIBAN_GAI_PLAY_AREA,
  ICHIBAN_GAI_SPAWN_POINTS_M,
  ichibanGaiNavGraph,
  overlapsAny,
  parseGameplayConfig,
  type StaticBox,
  type Vector3,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { ICHIBAN_GAI_MAP } from '../arena/ichibanGaiMap.ts'
import { competitorFeetM } from '../character/competitorAvatar.ts'
import type { KillNotice } from './arenaFrameLog.ts'
import { type ArenaSession, createArenaSession } from './arenaSession.ts'
import { createLocalCharacter } from './localCharacter.ts'
import { createWeaponInput } from './weaponInputFrom.ts'
import { createMovementInput } from './wishDirection.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const BOXES = arenaCollisionBoxes(ICHIBAN_GAI_MAP)
const FRAME_S = 1 / 60
const MATCH_S = config.match.durationS

function feetOf(eyeM: readonly [number, number, number]): Vector3 {
  const [x, y, z] = competitorFeetM(eyeM, config.collision.capsuleHeightM)
  return { x, y, z }
}

/**
 * A partida de verdade: o Ichiban-gai, o grafo dele, os oito spawns e três
 * bots hostis — com o jogador **parado** no spawn 0, sem atirar. É o teste
 * que diz se os bots jogam: se eles se acham, se se matam, e se nenhum deles
 * fica preso num canto ou atravessa uma parede em cinco minutos de partida.
 */
function playTheMatch(): MatchReport {
  const spawns = ICHIBAN_GAI_SPAWN_POINTS_M.map(feetOf)
  const session = createArenaSession({
    config,
    character: createLocalCharacter(config, spawns[0] as Vector3, BOXES),
    boxes: BOXES,
    navGraph: ichibanGaiNavGraph(),
    movementInput: createMovementInput(),
    weaponInput: createWeaponInput(),
    playArea: ICHIBAN_GAI_PLAY_AREA,
    respawnFeetM: spawns,
  })
  session.restartMatch({
    hostileBots: true,
    botDifficulty: 'normal',
    botCount: 3,
    meleeWeapon: 'katana',
  })
  const report = createReport(session.bots.length)
  const frame = { elapsedS: FRAME_S, aimM: { x: 0, y: 0, z: 1 } }
  for (let tick = 0; tick * FRAME_S < MATCH_S; tick += 1) {
    session.advance(frame)
    observe(session, report, tick * FRAME_S)
  }
  return report
}

interface MatchReport {
  readonly killsByBots: Map<string, number>
  localDeaths: number
  breaches: number
  fellOut: number
  /** Por bot, o maior tempo vivo, fora de combate, sem sair de um raio de 1,5 m. */
  readonly longestStallS: number[]
  readonly anchors: { position: Vector3; sinceS: number }[]
}

function createReport(bots: number): MatchReport {
  return {
    killsByBots: new Map(),
    localDeaths: 0,
    breaches: 0,
    fellOut: 0,
    longestStallS: new Array<number>(bots).fill(0),
    anchors: Array.from({ length: bots }, () => ({ position: { x: 0, y: -99, z: 0 }, sinceS: 0 })),
  }
}

function observe(session: ArenaSession, report: MatchReport, nowS: number): void {
  for (let index = 0; index < session.lastKills.count; index += 1) {
    tallyKill(session.lastKills.slots[index], report)
  }
  for (const [index, bot] of session.bots.entries()) observeBot(bot, index, report, nowS)
}

function tallyKill(notice: KillNotice | undefined, report: MatchReport): void {
  if (notice?.victimId === 'local') report.localDeaths += 1
  if (!notice?.shooterId.startsWith('bot-')) return
  report.killsByBots.set(notice.shooterId, (report.killsByBots.get(notice.shooterId) ?? 0) + 1)
}

const STALL_RADIUS_M = 1.5

function observeBot(bot: BotPlayer, index: number, report: MatchReport, nowS: number): void {
  if (penetrates(bot, BOXES)) report.breaches += 1
  if (bot.body.position.y < -0.5) report.fellOut += 1
  const anchor = report.anchors[index] as MatchReport['anchors'][number]
  const { x, y, z } = bot.body.position
  const dx = x - anchor.position.x
  const dy = y - anchor.position.y
  const dz = z - anchor.position.z
  // morto, ou trocando tiro, o bot está parado de propósito: a âncora anda junto.
  const resting = !bot.alive || bot.mind.targetIndex >= 0
  if (resting || dx * dx + dy * dy + dz * dz > STALL_RADIUS_M * STALL_RADIUS_M) {
    anchor.position = { x, y, z }
    anchor.sinceS = nowS
    return
  }
  const stalled = nowS - anchor.sinceS
  report.longestStallS[index] = Math.max(report.longestStallS[index] ?? 0, stalled)
}

function penetrates(bot: BotPlayer, boxes: readonly StaticBox[]): boolean {
  const inset = 1e-3
  return overlapsAny(
    {
      feetX: bot.body.position.x,
      feetY: bot.body.position.y + inset,
      feetZ: bot.body.position.z,
      radiusM: config.collision.capsuleRadiusM - inset,
      heightM: bot.body.capsuleHeightM - 2 * inset,
    },
    boxes,
  )
}

describe('uma partida inteira com três bots no Ichiban-gai', () => {
  const report = playTheMatch()

  it('os bots matam: o jogador parado e uns aos outros', () => {
    const total = [...report.killsByBots.values()].reduce((sum, kills) => sum + kills, 0)
    expect(report.localDeaths).toBeGreaterThan(0)
    expect(total).toBeGreaterThan(report.localDeaths)
  })

  /**
   * Parado no spawn, o jogador é o alvo mais fácil da sala, e mesmo assim não
   * pode virar tiro ao alvo: no playtest de 11/10 os bots não erravam. Uma
   * morte a cada 20 s é o teto do nível normal.
   */
  it('no normal, o jogador parado morre no máximo uma vez a cada 20 segundos', () => {
    expect(report.localDeaths).toBeLessThanOrEqual(MATCH_S / 20)
  })

  it('todo bot mata alguém em cinco minutos', () => {
    expect(report.killsByBots.size).toBe(3)
  })

  /** Preso é ficar parado sem estar trocando tiro: o destravamento tem que agir antes disso. */
  it('nenhum bot fica preso no mesmo lugar por mais de oito segundos', () => {
    for (const stallS of report.longestStallS) expect(stallS).toBeLessThan(8)
  })

  it('nenhum bot atravessa parede nem cai do mundo', () => {
    expect([report.breaches, report.fellOut]).toEqual([0, 0])
  })
})
