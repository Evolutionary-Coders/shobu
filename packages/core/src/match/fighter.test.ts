import { describe, expect, it } from 'vitest'
import { config, standingFighter } from '../bots/botTestKit.ts'
import { createTargetList } from '../collision/targetList.ts'
import { createSeededRandom } from '../math/seededRandom.ts'
import { EYE_HEIGHT_RATIO, eyeOf } from '../movement/characterState.ts'
import {
  collectFighterTargets,
  type Fighter,
  killFighter,
  pickSpawn,
  stepRespawnClock,
} from './fighter.ts'

function trio(): Fighter[] {
  return [
    standingFighter('local', { x: 0, y: 0, z: -5 }),
    standingFighter('bot-0', { x: 0, y: 0, z: 10 }),
    standingFighter('bot-1', { x: 5, y: 0, z: 10 }),
  ]
}

describe('collectFighterTargets', () => {
  it('enfileira os vivos menos o atirador, com o índice de cada um na lista', () => {
    const fighters = trio()
    const targets = collectFighterTargets(fighters, 1, config, createTargetList(3))
    expect(targets.boxes.slice(0, targets.count).map((box) => box.sourceIndex)).toEqual([0, 2])
  })

  it('morto não é alvo', () => {
    const fighters = trio()
    killFighter(fighters[2] as Fighter, 1)
    const targets = collectFighterTargets(fighters, 0, config, createTargetList(3))
    expect(targets.count).toBe(1)
  })

  /** Quem desliza passa por baixo da linha de tiro: a cápsula do alvo é a de agora. */
  it('a altura do alvo é a da cápsula agora, e não a da configuração', () => {
    const fighters = trio()
    const crouched = fighters[1] as Fighter
    ;(crouched.body as { capsuleHeightM: number }).capsuleHeightM = 1.2
    const targets = collectFighterTargets(fighters, 0, config, createTargetList(3))
    expect(targets.boxes[0]?.heightM).toBe(1.2)
  })
})

describe('morte e respawn', () => {
  it('matar arma o relógio, e matar o morto não conta de novo', () => {
    const fighter = trio()[0] as Fighter
    expect(killFighter(fighter, 1.5)).toBe(true)
    fighter.respawnLeftS = 0.5
    expect(killFighter(fighter, 1.5)).toBe(false)
    expect(fighter.respawnLeftS).toBe(0.5)
  })

  it('o relógio volta o morto à vida no tick em que zera, e só nele', () => {
    const fighter = trio()[0] as Fighter
    killFighter(fighter, 0.05)
    expect(stepRespawnClock(fighter, 0.03)).toBe(false)
    expect(fighter.alive).toBe(false)
    expect(stepRespawnClock(fighter, 0.03)).toBe(true)
    expect(fighter.alive).toBe(true)
    expect(stepRespawnClock(fighter, 0.03)).toBe(false)
  })
})

describe('eyeOf', () => {
  it('o olho fica a EYE_HEIGHT_RATIO da cápsula, acima do pé', () => {
    const fighter = trio()[1] as Fighter
    const eye = eyeOf(fighter.body, { x: 0, y: 0, z: 0 })
    expect(eye).toEqual({ x: 0, y: config.collision.capsuleHeightM * EYE_HEIGHT_RATIO, z: 10 })
  })
})

describe('pickSpawn', () => {
  const spawns = [
    { x: 0, y: 0, z: -5 },
    { x: 0, y: 0, z: 10 },
    { x: 20, y: 0, z: 20 },
  ]

  it('nunca escolhe um spawn com alguém vivo em cima', () => {
    const fighters = trio()
    for (let seed = 0; seed < 20; seed += 1) {
      expect(pickSpawn(spawns, fighters, createSeededRandom(seed))).toBe(2)
    }
  })

  it('morto em cima não ocupa o spawn', () => {
    const fighters = trio()
    for (const fighter of fighters) fighter.alive = false
    const picks = new Set(
      Array.from({ length: 30 }, (_, seed) =>
        pickSpawn(spawns, fighters, createSeededRandom(seed)),
      ),
    )
    expect(picks).toEqual(new Set([0, 1, 2]))
  })

  it('com todos ocupados, qualquer um serve', () => {
    const pick = pickSpawn(spawns.slice(0, 2), trio(), createSeededRandom(3))
    expect([0, 1]).toContain(pick)
  })

  it('a mesma semente dá o mesmo spawn', () => {
    const fighters: Fighter[] = []
    expect(pickSpawn(spawns, fighters, createSeededRandom(9))).toBe(
      pickSpawn(spawns, fighters, createSeededRandom(9)),
    )
  })

  it('recusa lista de spawns vazia', () => {
    expect(() => pickSpawn([], [], createSeededRandom(1))).toThrow(/spawnsFeetM \[\]/)
  })
})
