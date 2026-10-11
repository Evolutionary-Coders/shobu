import { describe, expect, it } from 'vitest'
import { createTargetList } from '../collision/targetList.ts'
import { type Fighter, killFighter, stepRespawnClock } from '../match/fighter.ts'
import { resolveFighterShot, type ShotRange } from '../match/fighterShot.ts'
import { createShotHit } from '../weapon/resolveShot.ts'
import { spreadTangent } from '../weapon/spreadTangent.ts'
import {
  aimAndTrigger,
  type BotSquad,
  type BotTick,
  createBotSquad,
  isBenched,
  moveBot,
  placeBot,
  seatBots,
  setBotDifficulty,
} from './botSquad.ts'
import { ARENA, BOXES, config, DT_S, standingFighter } from './botTestKit.ts'
import { currentWaypoint } from './navRoute.ts'

function squadOf(count: number, seed = 11): BotSquad {
  return createBotSquad({ count, seed, arena: ARENA, config })
}

function tickOf(squad: BotSquad, fighters: readonly Fighter[] = squad.bots): BotTick {
  return { squad, fighters, config, dtS: DT_S }
}

/** Um bot sozinho, de frente para um alvo parado na rua norte, sem parede no meio. */
function duelOnTheNorthStreet(): { squad: BotSquad; tick: BotTick; foe: Fighter } {
  const squad = squadOf(1)
  const foe = standingFighter('local', { x: 10, y: 0, z: 10 })
  const bot = squad.bots[0] as (typeof squad.bots)[number]
  placeAt(bot, { x: -2, y: 0, z: 10 })
  return { squad, tick: tickOf(squad, [foe, bot]), foe }
}

function placeAt(bot: BotSquad['bots'][number], feetM: { x: number; y: number; z: number }): void {
  for (const body of [bot.body, bot.previousBody]) {
    body.position.x = feetM.x
    body.position.y = feetM.y
    body.position.z = feetM.z
    body.grounded = true
  }
}

describe('createBotSquad', () => {
  it('cria os bots com id e nome próprios, vivos e cada um num spawn', () => {
    const squad = squadOf(3)
    expect(squad.bots.map((bot) => bot.id)).toEqual(['bot-0', 'bot-1', 'bot-2'])
    expect(new Set(squad.bots.map((bot) => bot.callsign)).size).toBe(3)
    expect(squad.bots.every((bot) => bot.alive)).toBe(true)
    const spots = squad.bots.map((bot) => `${bot.body.position.x},${bot.body.position.z}`)
    expect(new Set(spots).size).toBe(3)
  })

  it('todo bot já nasce com um destino', () => {
    for (const bot of squadOf(3).bots)
      expect(currentWaypoint(bot.locomotion.route)).toBeGreaterThanOrEqual(0)
  })

  /** A sala do servidor e a do cliente chegam aos mesmos bots pela mesma semente. */
  it('a mesma semente dá os mesmos nomes e os mesmos spawns', () => {
    const where = (squad: BotSquad) =>
      squad.bots.map((bot) => [bot.callsign, { ...bot.body.position }])
    expect(where(squadOf(3, 5))).toEqual(where(squadOf(3, 5)))
  })

  it('sem nível pedido, os bots jogam no normal; pedido, no nível dele', () => {
    expect(squadOf(1).hand.skill).toBe(config.botSkillNormal)
    const hard = createBotSquad({ count: 1, seed: 1, arena: ARENA, config, difficulty: 'hard' })
    expect(hard.hand.skill).toBe(config.botSkillHard)
  })

  it('recusa arena sem spawn', () => {
    expect(() =>
      createBotSquad({ count: 1, seed: 1, arena: { ...ARENA, spawnsFeetM: [] }, config }),
    ).toThrow(/spawnsFeetM \[\]/)
  })
})

describe('setBotDifficulty', () => {
  it('troca o nível e as tangentes juntos, do próximo tick em diante', () => {
    const squad = squadOf(1)
    setBotDifficulty(squad, config, 'easy')
    expect(squad.hand.skill).toBe(config.botSkillEasy)
    expect(squad.hand.tangents.residual).toBeCloseTo(
      Math.tan((config.botSkillEasy.aimResidualDeg * Math.PI) / 180),
    )
  })
})

describe('seatBots', () => {
  it('manda ao banco os bots além da contagem, e o banco não volta sozinho', () => {
    const squad = squadOf(3)
    seatBots(squad, squad.bots, 1, config)
    const [first, second, third] = squad.bots
    expect([first?.alive, second?.alive, third?.alive]).toEqual([true, false, false])
    expect(squad.bots.map(isBenched)).toEqual([false, true, true])
    expect(stepRespawnClock(second as Fighter, 100)).toBe(false)
  })

  it('subir a contagem traz os do banco de volta, vivos num spawn', () => {
    const squad = squadOf(3)
    seatBots(squad, squad.bots, 0, config)
    seatBots(squad, squad.bots, 3, config)
    expect(squad.bots.every((bot) => bot.alive)).toBe(true)
  })

  it('morto esperando o respawn não é banco', () => {
    const squad = squadOf(1)
    killFighter(squad.bots[0] as Fighter, 1)
    expect(isBenched(squad.bots[0] as (typeof squad.bots)[number])).toBe(false)
    seatBots(squad, squad.bots, 1, config)
    expect(squad.bots[0]?.alive).toBe(false)
  })
})

describe('placeBot', () => {
  it('põe de pé num spawn, vivo e com rota, mesmo vindo da morte', () => {
    const squad = squadOf(1)
    const bot = squad.bots[0] as BotSquad['bots'][number]
    killFighter(bot, 1)
    bot.body.position.y = -40
    placeBot(squad, bot, squad.bots, config)
    expect(bot.alive).toBe(true)
    expect(ARENA.spawnsFeetM).toContainEqual(bot.body.position)
    expect(currentWaypoint(bot.locomotion.route)).toBeGreaterThanOrEqual(0)
  })
})

describe('aimAndTrigger', () => {
  it('vê, espera o tempo de reação, e atira', () => {
    const { squad, tick } = duelOnTheNorthStreet()
    const bot = squad.bots[0] as BotSquad['bots'][number]
    let firedAtS = -1
    for (let tickIndex = 0; tickIndex < 3 / DT_S && firedAtS < 0; tickIndex += 1) {
      if (aimAndTrigger(bot, 1, tick)) firedAtS = tickIndex * DT_S
    }
    expect(firedAtS).toBeGreaterThanOrEqual(config.botSkillNormal.reactionS)
    expect(bot.mind.targetIndex).toBe(0)
  })

  it('colado no alvo, golpeia com a faca em vez de atirar', () => {
    const { squad } = duelOnTheNorthStreet()
    const bot = squad.bots[0] as BotSquad['bots'][number]
    const foe = standingFighter('local', { x: -0.5, y: 0, z: 10 })
    const tick = tickOf(squad, [foe, bot])
    let struck = false
    for (let tickIndex = 0; tickIndex < 3 / DT_S && !struck; tickIndex += 1) {
      expect(aimAndTrigger(bot, 1, tick)).toBe(false)
      struck = bot.melee.struckThisTick
    }
    expect(struck).toBe(true)
    expect(bot.melee.weapon).toBe('knife')
  })

  /** No treino o bot é alvo que anda: nunca puxa o gatilho. */
  it('fora do modo hostil, nunca atira', () => {
    const { squad, tick } = duelOnTheNorthStreet()
    squad.hostile = false
    const bot = squad.bots[0] as BotSquad['bots'][number]
    for (let tickIndex = 0; tickIndex < 3 / DT_S; tickIndex += 1) {
      expect(aimAndTrigger(bot, 1, tick)).toBe(false)
    }
    expect(bot.mind.targetIndex).toBe(-1)
  })
})

describe('moveBot', () => {
  it('trocando tiro, dá passo lateral em vez de seguir a rota', () => {
    const { squad, tick } = duelOnTheNorthStreet()
    const bot = squad.bots[0] as BotSquad['bots'][number]
    for (let tickIndex = 0; tickIndex < 10; tickIndex += 1) aimAndTrigger(bot, 1, tick)
    moveBot(bot, tick)
    // o alvo está a leste: o passo é norte-sul, sem corrida.
    expect(Math.abs(bot.movementInput.wishZ)).toBeCloseTo(1)
    expect(bot.movementInput.wishX).toBeCloseTo(0)
    expect(bot.movementInput.sprint).toBe(false)
  })

  /** O alvo que ficou na cabeça ao trocar de modo não vira passo lateral no treino. */
  it('fora do modo hostil, segue a rota mesmo com um alvo guardado', () => {
    const { squad, tick } = duelOnTheNorthStreet()
    const bot = squad.bots[0] as BotSquad['bots'][number]
    bot.mind.targetIndex = 0
    squad.hostile = false
    moveBot(bot, tick)
    expect(bot.movementInput.sprint).toBe(true)
  })

  it('o lado do passo troca com o tempo', () => {
    const { squad, tick } = duelOnTheNorthStreet()
    const bot = squad.bots[0] as BotSquad['bots'][number]
    const sides = new Set<number>()
    for (let tickIndex = 0; tickIndex < 4 / DT_S; tickIndex += 1) {
      aimAndTrigger(bot, 1, tick)
      moveBot(bot, tick)
      sides.add(Math.sign(bot.movementInput.wishZ))
    }
    expect(sides).toEqual(new Set([1, -1]))
  })

  it('com o alvo bem em cima, o passo não vira NaN', () => {
    const { squad, tick, foe } = duelOnTheNorthStreet()
    const bot = squad.bots[0] as BotSquad['bots'][number]
    bot.mind.targetIndex = 0
    ;(foe.body as { position: { x: number; z: number } }).position.x = bot.body.position.x
    ;(foe.body as { position: { x: number; z: number } }).position.z = bot.body.position.z
    moveBot(bot, tick)
    expect(bot.movementInput.wishX).toBeCloseTo(0)
    expect(bot.movementInput.wishZ).toBeCloseTo(0)
  })

  it('sem alvo, segue a rota, e ao fim dela escolhe outra', () => {
    const squad = squadOf(1)
    const bot = squad.bots[0] as BotSquad['bots'][number]
    const destinations = new Set<number>([bot.locomotion.destination])
    for (let tickIndex = 0; tickIndex < 40 / DT_S; tickIndex += 1) {
      aimAndTrigger(bot, 0, tickOf(squad))
      moveBot(bot, tickOf(squad))
      destinations.add(bot.locomotion.destination)
    }
    expect(destinations.size).toBeGreaterThan(2)
  })

  /** Preso: primeiro tenta o pulo, depois desiste do trecho e replaneja. */
  it('preso, pula na primeira vez e replaneja na segunda', () => {
    const squad = squadOf(1)
    const bot = squad.bots[0] as BotSquad['bots'][number]
    const tick = tickOf(squad)
    bot.locomotion.stalledS = config.bots.stuckAfterS
    bot.locomotion.closestM = 0
    moveBot(bot, tick)
    expect(bot.locomotion.stuckCount).toBe(1)
    expect(bot.movementInput.jump).toBe(true)
    bot.locomotion.stalledS = config.bots.stuckAfterS
    bot.locomotion.closestM = 0
    moveBot(bot, tick)
    // replanejar zera o relógio de progresso: a rota nova começa do zero.
    expect(bot.locomotion.closestM).toBeGreaterThan(0)
  })

  it('o corpo anterior guarda o tick de antes, para o render interpolar', () => {
    const squad = squadOf(1)
    const bot = squad.bots[0] as BotSquad['bots'][number]
    for (let tickIndex = 0; tickIndex < 30; tickIndex += 1) moveBot(bot, tickOf(squad))
    const before = { ...bot.body.position }
    moveBot(bot, tickOf(squad))
    expect(bot.previousBody.position).toEqual(before)
  })
})

interface DuelTally {
  kills: number
  respawns: number
  wallBreaches: number
}

/** Um tick de um bot no duelo: relógio se morto; senão arma, tiro e corpo. */
function duelTick(squad: BotSquad, index: number, range: ShotRange, tally: DuelTally): void {
  const bot = squad.bots[index] as BotSquad['bots'][number]
  if (!bot.alive) {
    if (stepRespawnClock(bot, DT_S)) placeBot(squad, bot, squad.bots, config)
    tally.respawns += bot.alive ? 1 : 0
    return
  }
  const tick = tickOf(squad)
  if (aimAndTrigger(bot, index, tick)) tally.kills += landShot(squad, index, range)
  moveBot(bot, tick)
  const { x, y, z } = bot.body.position
  if (Math.abs(x) < 3 - 0.4 && Math.abs(z) < 1 - 0.4 && y < 4) tally.wallBreaches += 1
}

function landShot(squad: BotSquad, index: number, range: ShotRange): number {
  const bot = squad.bots[index] as BotSquad['bots'][number]
  const aim = {
    shooterIndex: index,
    eyeM: bot.eyeM,
    aimM: bot.aimM,
    weapon: bot.weapon,
    seedBase: 1,
  }
  const victim = resolveFighterShot(aim, squad.bots, range, createShotHit())
  if (victim < 0) return 0
  return killFighter(squad.bots[victim] as Fighter, config.match.respawnDelayS) ? 1 : 0
}

/**
 * Dois bots soltos na arena de bolso, atirando de verdade: o tiro pelo mesmo
 * `resolveFighterShot` do jogador, a morte e o respawn pelo relógio. Em um
 * minuto de partida alguém tem que morrer — senão a mira, o gatilho ou a
 * linha de visão não estão ligados.
 */
describe('um duelo de bots na arena de bolso', () => {
  it('em um minuto, há kills e respawns, e ninguém atravessa a parede', () => {
    const squad = squadOf(2, 3)
    const range: ShotRange = {
      boxes: BOXES,
      config,
      coneTangent: spreadTangent(config.weapon.noScopeSpreadDeg),
      targets: createTargetList(2),
    }
    const tally: DuelTally = { kills: 0, respawns: 0, wallBreaches: 0 }
    for (let tickIndex = 0; tickIndex < 60 / DT_S; tickIndex += 1) {
      for (let index = 0; index < squad.bots.length; index += 1)
        duelTick(squad, index, range, tally)
    }
    expect(tally.kills).toBeGreaterThan(0)
    expect(tally.respawns).toBeGreaterThan(0)
    expect(tally.wallBreaches).toBe(0)
  })
})
