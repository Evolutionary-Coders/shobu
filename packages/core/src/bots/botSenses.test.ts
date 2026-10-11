import { describe, expect, it } from 'vitest'
import type { Fighter } from '../match/fighter.ts'
import { createSeededRandom } from '../math/seededRandom.ts'
import { lengthSquared } from '../math/vector3.ts'
import { type BotMind, createBotPlayer } from './botPlayer.ts'
import {
  chestOffset,
  createBotView,
  isVisibleFoe,
  LOOK_AROUND_INTERVAL_S,
  lookAround,
  type MutableBotView,
  nearestVisibleFoe,
  noticeShot,
  sampleAimJitter,
} from './botSenses.ts'
import { BOXES, config, DT_S, GRAPH, JITTER_GIVE_UP_SEED, standingFighter } from './botTestKit.ts'

/** O bot em (-10, 10); um inimigo à vista no norte e outro atrás da parede, ao sul. */
function scene(): { view: MutableBotView; fighters: Fighter[] } {
  const fighters = [
    standingFighter('bot-0', { x: -10, y: 0, z: 10 }),
    standingFighter('local', { x: 10, y: 0, z: 10 }),
    standingFighter('bot-1', { x: 3, y: 0, z: -8 }),
  ]
  const view = createBotView(BOXES, config.bots.sightRangeM)
  view.eyeM = { x: -10, y: 1.66, z: 10 }
  view.selfIndex = 0
  view.fighters = fighters
  return { view, fighters }
}

describe('nearestVisibleFoe', () => {
  it('acha o inimigo vivo mais perto à vista', () => {
    expect(nearestVisibleFoe(scene().view)).toBe(1)
  })

  /** A parede no meio esconde: atrás dela não se mira, mesmo mais perto. */
  it('não enxerga através da parede', () => {
    const { view, fighters } = scene()
    view.eyeM = { x: 0, y: 1.66, z: 6 }
    ;(fighters[1] as Fighter).alive = false
    expect(nearestVisibleFoe(view)).toBe(-1)
  })

  it('não enxerga além do alcance de visão', () => {
    const { view } = scene()
    view.sightRangeM = 10
    expect(nearestVisibleFoe(view)).toBe(-1)
  })

  it('não se escolhe, nem escolhe morto', () => {
    const { view, fighters } = scene()
    ;(fighters[1] as Fighter).alive = false
    view.eyeM = { x: 0, y: 1.66, z: -10 }
    expect(nearestVisibleFoe(view)).toBe(2)
    ;(fighters[2] as Fighter).alive = false
    expect(nearestVisibleFoe(view)).toBe(-1)
  })

  it('entre dois à vista, o mais perto', () => {
    const { view, fighters } = scene()
    fighters.push(standingFighter('bot-2', { x: -4, y: 0, z: 10 }))
    expect(nearestVisibleFoe(view)).toBe(3)
  })
})

describe('chestOffset', () => {
  it('vai do olho ao peito do alvo e devolve o quadrado da distância', () => {
    const foe = standingFighter('local', { x: 3, y: 0, z: 4 })
    const out = { x: 0, y: 0, z: 0 }
    const eye = { x: 0, y: foe.body.capsuleHeightM * 0.62, z: 0 }
    expect(chestOffset(eye, foe, out)).toBeCloseTo(25)
    expect(out.y).toBeCloseTo(0)
  })
})

describe('lookAround', () => {
  function bot() {
    return createBotPlayer(
      { id: 'bot-0', callsign: 'ONRYO', seed: 1 },
      { x: -10, y: 0, z: 10 },
      GRAPH,
      config,
    )
  }

  it('acha o alvo no primeiro olhar e zera o relógio', () => {
    const { view } = scene()
    const mind = bot().mind
    lookAround(mind, view, DT_S)
    expect([mind.targetIndex, mind.targetSeenS]).toEqual([1, 0])
  })

  it('o relógio do alvo corre a cada tick, e o olhar só se repete no intervalo', () => {
    const { view } = scene()
    const mind = bot().mind
    expect(lookAround(mind, view, DT_S)).toBe(true)
    expect(lookAround(mind, view, DT_S)).toBe(false)
    expect(mind.targetIndex).toBe(1)
    expect(mind.targetSeenS).toBeCloseTo(DT_S)
  })

  /** Trocar pelo mais perto a cada olhar fazia a mira reassentar sem parar. */
  it('fica com o alvo de agora enquanto ele está à vista, mesmo com outro mais perto', () => {
    const { view, fighters } = scene()
    const mind = bot().mind
    lookAround(mind, view, DT_S)
    fighters.push(standingFighter('bot-2', { x: -6, y: 0, z: 10 }))
    lookAroundFor(mind, view, LOOK_AROUND_INTERVAL_S * 2)
    expect(mind.targetIndex).toBe(1)
  })

  /** Sem parede transparente: atrás da parede o alvo se perde, e voltar a vê-lo é aquisição nova. */
  it('perde o alvo que sai da linha de visão e, sem outro à vista, fica sem ninguém', () => {
    const { view, fighters } = scene()
    const mind = bot().mind
    lookAround(mind, view, DT_S)
    // o mesmo alvo, agora na reta do bot com a parede no meio.
    fighters[1] = standingFighter('local', { x: 0, y: 0, z: 10 })
    ;(fighters[2] as Fighter).alive = false
    view.eyeM = { x: 0, y: 1.66, z: -10 }
    lookAroundFor(mind, view, LOOK_AROUND_INTERVAL_S * 2)
    expect(mind.targetIndex).toBe(-1)
  })

  it('perdido o alvo de agora, passa ao mais perto à vista', () => {
    const { view, fighters } = scene()
    const mind = bot().mind
    lookAround(mind, view, DT_S)
    fighters.push(standingFighter('bot-2', { x: -6, y: 0, z: 10 }))
    ;(fighters[1] as Fighter).alive = false
    expect(lookAround(mind, view, DT_S)).toBe(false)
    lookAroundFor(mind, view, LOOK_AROUND_INTERVAL_S * 2)
    expect([mind.targetIndex, mind.targetSeenS]).toEqual([3, expect.any(Number)])
  })

  it('quem atirou perto e está à vista vira o alvo no olhar seguinte', () => {
    const { view, fighters } = scene()
    const mind = bot().mind
    lookAround(mind, view, DT_S)
    fighters.push(standingFighter('bot-2', { x: -10, y: 0, z: 20 }))
    mind.threatIndex = 3
    mind.lookAroundLeftS = 0
    expect(lookAround(mind, view, DT_S)).toBe(true)
    expect([mind.targetIndex, mind.threatIndex]).toEqual([3, -1])
  })

  /** Ouvir o tiro não é ver o atirador: escondido, ele não vira alvo. */
  it('quem atirou perto escondido atrás da parede não vira alvo', () => {
    const { view } = scene()
    const mind = bot().mind
    lookAround(mind, view, DT_S)
    mind.threatIndex = 2
    mind.lookAroundLeftS = 0
    lookAround(mind, view, DT_S)
    expect([mind.targetIndex, mind.threatIndex]).toEqual([1, -1])
  })

  it('o susto passa com o tempo', () => {
    const { view } = scene()
    const mind = bot().mind
    mind.flinchLeftS = DT_S * 1.5
    lookAround(mind, view, DT_S)
    expect(mind.flinchLeftS).toBeCloseTo(DT_S * 0.5)
    lookAround(mind, view, DT_S)
    expect(mind.flinchLeftS).toBe(0)
  })

  it('o alvo que morre sai na hora, sem esperar o próximo olhar', () => {
    const { view, fighters } = scene()
    const mind = bot().mind
    lookAround(mind, view, DT_S)
    ;(fighters[1] as Fighter).alive = false
    lookAround(mind, view, DT_S)
    expect(mind.targetIndex).toBe(-1)
  })

  it('o mesmo alvo no olhar seguinte não é aquisição nova', () => {
    const { view } = scene()
    const mind = bot().mind
    lookAround(mind, view, DT_S)
    let acquired = false
    for (let tick = 0; tick * DT_S <= LOOK_AROUND_INTERVAL_S; tick += 1) {
      acquired ||= lookAround(mind, view, DT_S)
    }
    expect(acquired).toBe(false)
    expect(mind.targetSeenS).toBeGreaterThan(LOOK_AROUND_INTERVAL_S)
  })
})

function lookAroundFor(mind: BotMind, view: MutableBotView, seconds: number): void {
  for (let tick = 0; tick * DT_S < seconds; tick += 1) lookAround(mind, view, DT_S)
}

describe('isVisibleFoe', () => {
  it('à vista, vivo e não ele mesmo', () => {
    const { view } = scene()
    expect([0, 1, 2, -1, 9].map((index) => isVisibleFoe(view, index))).toEqual([
      false,
      true,
      false,
      false,
      false,
    ])
  })

  it('fora do alcance, não', () => {
    const { view } = scene()
    view.sightRangeM = 10
    expect(isVisibleFoe(view, 1)).toBe(false)
  })

  it('morto, não', () => {
    const { view, fighters } = scene()
    ;(fighters[1] as Fighter).alive = false
    expect(isVisibleFoe(view, 1)).toBe(false)
  })
})

describe('noticeShot', () => {
  function listener() {
    return createBotPlayer(
      { id: 'bot-0', callsign: 'ONRYO', seed: 1 },
      { x: 0, y: 0, z: 0 },
      GRAPH,
      config,
    )
  }
  const chestY = config.collision.capsuleHeightM * 0.62

  it('o tiro que passa perto do peito assusta e aponta o atirador', () => {
    const bot = listener()
    bot.mind.lookAroundLeftS = 0.05
    const shot = {
      shooterIndex: 2,
      fromM: { x: -30, y: chestY, z: 1 },
      toM: { x: 30, y: chestY, z: 1 },
    }
    expect(noticeShot(bot, 0, shot, config.bots)).toBe(true)
    expect(bot.mind).toMatchObject({
      threatIndex: 2,
      lookAroundLeftS: 0,
      flinchLeftS: config.bots.flinchS,
    })
  })

  it('o tiro que passa longe não muda nada', () => {
    const bot = listener()
    const far = config.bots.nearMissM + 1
    const shot = {
      shooterIndex: 2,
      fromM: { x: -30, y: chestY, z: far },
      toM: { x: 30, y: chestY, z: far },
    }
    expect(noticeShot(bot, 0, shot, config.bots)).toBe(false)
    expect(bot.mind.threatIndex).toBe(-1)
  })

  /** O raio é um trecho: o tiro que parou numa parede antes do bot não passou perto dele. */
  it('conta só o trecho que o raio percorreu, não a reta inteira', () => {
    const bot = listener()
    const shot = {
      shooterIndex: 2,
      fromM: { x: -30, y: chestY, z: 0 },
      toM: { x: -20, y: chestY, z: 0 },
    }
    expect(noticeShot(bot, 0, shot, config.bots)).toBe(false)
  })

  /** O raio que parou na boca do cano (parede colada) é um ponto, e o ponto também conta. */
  it('o raio sem comprimento conta pela distância do ponto', () => {
    const bot = listener()
    const point = { x: 1, y: chestY, z: 0 }
    expect(noticeShot(bot, 0, { shooterIndex: 2, fromM: point, toM: point }, config.bots)).toBe(
      true,
    )
  })

  it('o próprio tiro e o tiro em quem já morreu não assustam', () => {
    const bot = listener()
    const shot = {
      shooterIndex: 0,
      fromM: { x: 0, y: chestY, z: 0 },
      toM: { x: 0, y: chestY, z: 0 },
    }
    expect(noticeShot(bot, 0, shot, config.bots)).toBe(false)
    bot.alive = false
    expect(noticeShot(bot, 1, { ...shot, shooterIndex: 2 }, config.bots)).toBe(false)
  })
})

describe('sampleAimJitter', () => {
  it('cai dentro da bola de raio 1', () => {
    const rng = createSeededRandom(4)
    for (let draw = 0; draw < 200; draw += 1) {
      expect(lengthSquared(sampleAimJitter({ x: 0, y: 0, z: 0 }, rng))).toBeLessThanOrEqual(1)
    }
  })

  /** Oito recusas seguidas: a saída é mira sem erro, nunca um laço sem fim. */
  it('desistindo, fica no centro', () => {
    const out = sampleAimJitter({ x: 9, y: 9, z: 9 }, createSeededRandom(JITTER_GIVE_UP_SEED))
    expect(out).toEqual({ x: 0, y: 0, z: 0 })
  })
})
