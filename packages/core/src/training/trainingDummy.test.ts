import { describe, expect, it } from 'vitest'
import { createTargetList } from '../collision/targetList.ts'
import { shippedConfig, tickDurationS } from '../movement/movementTestKit.ts'
import {
  collectLiveTargets,
  createTrainingDummy,
  killTrainingDummy,
  stepTrainingDummy,
  type TrainingDummy,
} from './trainingDummy.ts'

const config = shippedConfig()
const dtS = tickDurationS(config)
const { respawnDelayS } = config.match

function dummyAt(z: number, id = 'dummy-0'): TrainingDummy {
  return createTrainingDummy(id, { x: 0, y: 0, z })
}

function runTicks(dummy: TrainingDummy, ticks: number): TrainingDummy {
  for (let tick = 0; tick < ticks; tick += 1) stepTrainingDummy(dummy, respawnDelayS, dtS)
  return dummy
}

describe('trainingDummy', () => {
  it('o boneco nasce vivo e atingível', () => {
    const targets = collectLiveTargets([dummyAt(20)], config, createTargetList(8))
    expect(targets.count).toBe(1)
  })

  it('morrer tira o boneco da lista de alvos', () => {
    const dummy = dummyAt(20)
    killTrainingDummy(dummy, respawnDelayS)
    expect(dummy.alive).toBe(false)
    expect(collectLiveTargets([dummy], config, createTargetList(8)).count).toBe(0)
  })

  it('o boneco volta depois do atraso de respawn da configuração', () => {
    const dummy = dummyAt(20)
    killTrainingDummy(dummy, respawnDelayS)
    runTicks(dummy, Math.ceil(respawnDelayS / dtS) - 2)
    expect(dummy.alive).toBe(false)
    runTicks(dummy, 3)
    expect(dummy.alive).toBe(true)
  })

  /** Metralhar o corpo caído não pode prender o boneco no chão para sempre. */
  it('matar quem já está morto não reinicia o cronômetro', () => {
    const dummy = dummyAt(20)
    killTrainingDummy(dummy, respawnDelayS)
    runTicks(dummy, 10)
    const left = dummy.respawnLeftS
    killTrainingDummy(dummy, respawnDelayS)
    expect(dummy.respawnLeftS).toBe(left)
  })

  it('o cronômetro não corre para quem está vivo', () => {
    const dummy = runTicks(dummyAt(20), 60)
    expect(dummy.respawnLeftS).toBe(0)
    expect(dummy.alive).toBe(true)
  })

  it('a caixa de acerto do boneco é a mesma cápsula do jogador', () => {
    const targets = collectLiveTargets([dummyAt(20)], config, createTargetList(8))
    expect(targets.boxes[0]?.radiusM).toBe(config.collision.capsuleRadiusM)
    expect(targets.boxes[0]?.heightM).toBe(config.collision.capsuleHeightM)
  })

  /** O índice na lista aponta de volta para o boneco, e é o que a kill usa. */
  it('a lista guarda de qual boneco é cada caixa, pulando os mortos', () => {
    const dummies = [dummyAt(10, 'a'), dummyAt(20, 'b'), dummyAt(30, 'c')]
    killTrainingDummy(dummies[1] as TrainingDummy, respawnDelayS)
    const targets = collectLiveTargets(dummies, config, createTargetList(8))
    expect(targets.count).toBe(2)
    expect([targets.sourceIndex[0], targets.sourceIndex[1]]).toEqual([0, 2])
  })

  it('a lista de alvos é reaproveitada entre ticks, sem alocar', () => {
    const targets = createTargetList(8)
    expect(collectLiveTargets([dummyAt(20)], config, targets)).toBe(targets)
    expect(collectLiveTargets([dummyAt(20)], config, targets).count).toBe(1)
  })
})
