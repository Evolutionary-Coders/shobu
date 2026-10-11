import { describe, expect, it } from 'vitest'
import type { Fighter } from '../match/fighter.ts'
import { createSeededRandom } from '../math/seededRandom.ts'
import { lengthSquared } from '../math/vector3.ts'
import { createBotPlayer } from './botPlayer.ts'
import {
  chestOffset,
  createBotView,
  LOOK_AROUND_INTERVAL_S,
  lookAround,
  type MutableBotView,
  nearestVisibleFoe,
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
    lookAround(mind, view, createSeededRandom(1), DT_S)
    expect([mind.targetIndex, mind.targetSeenS]).toEqual([1, 0])
  })

  it('o relógio do alvo corre a cada tick, e o olhar só se repete no intervalo', () => {
    const { view, fighters } = scene()
    const mind = bot().mind
    lookAround(mind, view, createSeededRandom(1), DT_S)
    fighters.push(standingFighter('bot-2', { x: -6, y: 0, z: 10 }))
    lookAround(mind, view, createSeededRandom(1), DT_S)
    expect(mind.targetIndex).toBe(1)
    expect(mind.targetSeenS).toBeCloseTo(DT_S)
    for (let tick = 0; tick * DT_S < LOOK_AROUND_INTERVAL_S; tick += 1) {
      lookAround(mind, view, createSeededRandom(1), DT_S)
    }
    expect([mind.targetIndex, mind.targetSeenS]).toEqual([3, 0])
  })

  it('o alvo que morre sai na hora, sem esperar o próximo olhar', () => {
    const { view, fighters } = scene()
    const mind = bot().mind
    lookAround(mind, view, createSeededRandom(1), DT_S)
    ;(fighters[1] as Fighter).alive = false
    lookAround(mind, view, createSeededRandom(1), DT_S)
    expect(mind.targetIndex).toBe(-1)
  })

  it('o mesmo alvo no olhar seguinte não reinicia a mira', () => {
    const { view } = scene()
    const mind = bot().mind
    lookAround(mind, view, createSeededRandom(1), DT_S)
    const jitter = { ...mind.aimJitter }
    for (let tick = 0; tick * DT_S <= LOOK_AROUND_INTERVAL_S; tick += 1) {
      lookAround(mind, view, createSeededRandom(2), DT_S)
    }
    expect(mind.aimJitter).toEqual(jitter)
    expect(mind.targetSeenS).toBeGreaterThan(LOOK_AROUND_INTERVAL_S)
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
