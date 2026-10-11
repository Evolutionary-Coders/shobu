import { describe, expect, it } from 'vitest'
import { createTargetList } from '../collision/targetList.ts'
import type { Fighter } from '../match/fighter.ts'
import { resolveFighterShot, type ShotRange } from '../match/fighterShot.ts'
import { type CharacterState, createCharacterState } from '../movement/characterState.ts'
import { IDLE_INPUT, type MovementInput } from '../movement/movementInput.ts'
import { FLOOR } from '../movement/movementTestKit.ts'
import { stepCharacter } from '../movement/stepCharacter.ts'
import { createShotHit } from '../weapon/resolveShot.ts'
import { spreadTangent } from '../weapon/spreadTangent.ts'
import { rearmWeapon } from '../weapon/weaponState.ts'
import type { BotPlayer } from './botPlayer.ts'
import { resetBotBody } from './botPlayer.ts'
import type { BotDifficulty } from './botSkill.ts'
import { aimAndTrigger, type BotTick, createBotSquad, moveBot } from './botSquad.ts'
import { ARENA, config, DT_S } from './botTestKit.ts'

/**
 * A meta de dificuldade, medida e não estimada: um bot contra um alvo a 30 m
 * em campo aberto, duelo após duelo, com o mesmo tiro, a mesma arma e o mesmo
 * passo lateral da partida. Cada duelo começa com o alvo aparecendo e termina
 * no primeiro acerto (que na partida é a kill), em quatro tiros ou em dez
 * segundos — é a taxa de acerto **por tiro** que o jogador sente.
 *
 * O que estes números travam é a reclamação do playtest de 11/10: o bot não
 * errava. Mexer no `gameplay.json` e sair da faixa é o teste falhando com a
 * taxa nova na mensagem.
 */
const DUEL_DISTANCE_M = 30
const DUELS = 160
const MAX_SHOTS_PER_DUEL = 4
const MAX_DUEL_S = 10
/** O alvo que corre de lado troca de lado neste ritmo, dentro de uma faixa de 12 m. */
const STRAFE_SWITCH_S = 1.2
const STRAFE_HALF_WIDTH_M = 6

type TargetMotion = 'still' | 'strafing'

interface DuelRecord {
  readonly shots: number
  readonly hits: number
  /** A média, em segundos, do alvo aparecer ao primeiro tiro. */
  readonly firstShotS: number
}

const OPEN_FIELD = { ...ARENA, boxes: [FLOOR] }

function recordDuels(difficulty: BotDifficulty, motion: TargetMotion): DuelRecord {
  const squad = createBotSquad({ count: 1, seed: 3, arena: OPEN_FIELD, config, difficulty })
  const bot = squad.bots[0] as BotPlayer
  const foeBody = createCharacterState({ x: 0, y: 0, z: DUEL_DISTANCE_M / 2 }, config)
  const foe: Fighter = {
    id: 'local',
    body: foeBody,
    facingM: { x: 0, y: 0, z: 1 },
    alive: true,
    respawnLeftS: 0,
  }
  const tick: BotTick = { squad, fighters: [foe, bot], config, dtS: DT_S }
  const tally = { shots: 0, hits: 0, firstShotSum: 0, duelsWithShot: 0 }
  for (let duel = 0; duel < DUELS; duel += 1) {
    const firstS = fightOneDuel(tick, bot, foeBody, motion, tally)
    if (firstS === undefined) continue
    tally.firstShotSum += firstS
    tally.duelsWithShot += 1
  }
  return {
    shots: tally.shots,
    hits: tally.hits,
    firstShotS: tally.firstShotSum / Math.max(1, tally.duelsWithShot),
  }
}

interface Duel {
  shots: number
  hit: boolean
  firstS: number | undefined
}

/** Um duelo; devolve quando saiu o primeiro tiro, ou nada se não saiu nenhum. */
function fightOneDuel(
  tick: BotTick,
  bot: BotPlayer,
  foeBody: CharacterState,
  motion: TargetMotion,
  tally: { shots: number; hits: number },
): number | undefined {
  resetBotBody(bot, { x: 0, y: 0, z: -DUEL_DISTANCE_M / 2 }, config)
  rearmWeapon(bot.weapon, config)
  foeBody.position.x = 0
  const runner = { input: { ...IDLE_INPUT }, sideS: STRAFE_SWITCH_S, side: 1 }
  const duel: Duel = { shots: 0, hit: false, firstS: undefined }
  for (let tickIndex = 0; isDuelOn(duel, tickIndex); tickIndex += 1) {
    shootOnce(tick, bot, duel, tickIndex * DT_S)
    if (duel.hit) break
    moveBot(bot, tick)
    if (motion === 'strafing') runSideways(foeBody, runner)
    else stepCharacter(foeBody, IDLE_INPUT, OPEN_FIELD.boxes, config, DT_S)
  }
  tally.shots += duel.shots
  tally.hits += duel.hit ? 1 : 0
  return duel.firstS
}

function isDuelOn(duel: Duel, tickIndex: number): boolean {
  return tickIndex * DT_S < MAX_DUEL_S && duel.shots < MAX_SHOTS_PER_DUEL
}

/** O tick da mão do bot; o tiro que acerta encerra o duelo, como a kill encerra na partida. */
function shootOnce(tick: BotTick, bot: BotPlayer, duel: Duel, nowS: number): void {
  if (!aimAndTrigger(bot, 1, tick)) return
  duel.shots += 1
  duel.firstS ??= nowS
  duel.hit = landsOnFoe(tick, bot)
}

const RANGE: ShotRange = {
  boxes: OPEN_FIELD.boxes,
  config,
  coneTangent: spreadTangent(config.weapon.noScopeSpreadDeg),
  targets: createTargetList(2),
}
const SHOT = createShotHit()

function landsOnFoe(tick: BotTick, bot: BotPlayer): boolean {
  const aim = { shooterIndex: 1, eyeM: bot.eyeM, aimM: bot.aimM, weapon: bot.weapon, seedBase: 7 }
  return resolveFighterShot(aim, tick.fighters, RANGE, SHOT) === 0
}

/** Corre de lado na velocidade de corrida, trocando de lado no ritmo e nas bordas da faixa. */
function runSideways(
  body: CharacterState,
  runner: { input: MovementInput & { wishX: number }; sideS: number; side: number },
): void {
  runner.sideS -= DT_S
  if (runner.sideS <= 0) {
    runner.side = -runner.side
    runner.sideS = STRAFE_SWITCH_S
  }
  if (body.position.x > STRAFE_HALF_WIDTH_M) runner.side = -1
  if (body.position.x < -STRAFE_HALF_WIDTH_M) runner.side = 1
  runner.input.wishX = runner.side
  stepCharacter(body, runner.input, OPEN_FIELD.boxes, config, DT_S)
}

function hitRate(record: DuelRecord): number {
  return record.hits / record.shots
}

/** As metas do pedido de 11/10, com folga de sete pontos para o sorteio. */
const STILL_TARGET_HIT_RATE: Readonly<Record<BotDifficulty, number>> = {
  easy: 0.25,
  normal: 0.4,
  hard: 0.6,
}
const TOLERANCE = 0.07

describe('a pontaria dos bots a 30 m, por nível', () => {
  const levels: readonly BotDifficulty[] = ['easy', 'normal', 'hard']
  const still = new Map(levels.map((level) => [level, recordDuels(level, 'still')]))
  const strafing = new Map(levels.map((level) => [level, recordDuels(level, 'strafing')]))

  for (const level of levels) {
    it(`${level}: contra o alvo parado, acerta perto da meta por tiro`, () => {
      const rate = hitRate(still.get(level) as DuelRecord)
      expect(rate).toBeGreaterThan(STILL_TARGET_HIT_RATE[level] - TOLERANCE)
      expect(rate).toBeLessThan(STILL_TARGET_HIT_RATE[level] + TOLERANCE)
    })

    /** Correr de lado tem que salvar: é a resposta que o jogador tem ao bot. */
    it(`${level}: contra o alvo correndo de lado, acerta mais ou menos a metade`, () => {
      const ratio =
        hitRate(strafing.get(level) as DuelRecord) / hitRate(still.get(level) as DuelRecord)
      expect(ratio).toBeGreaterThan(0.35)
      expect(ratio).toBeLessThan(0.7)
    })
  }

  it('os níveis ficam em ordem: o difícil acerta mais que o normal, que acerta mais que o fácil', () => {
    const rates = levels.map((level) => hitRate(still.get(level) as DuelRecord))
    expect(rates).toEqual([...rates].sort((a, b) => a - b))
  })

  /** Ninguém é aimbot: da primeira visão ao primeiro tiro passa tempo de gente. */
  it('no normal, o primeiro tiro sai em média 0,8 s ou mais depois de ver o alvo', () => {
    expect((still.get('normal') as DuelRecord).firstShotS).toBeGreaterThanOrEqual(0.8)
  })
})
