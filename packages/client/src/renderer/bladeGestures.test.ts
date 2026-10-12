import { describe, expect, it } from 'vitest'
import {
  BLADE_GESTURES,
  BLADE_GUARDS,
  type BladeGesture,
  gestureDurationS,
  isQuickGesture,
  sampleTrack,
} from './bladeGestures.ts'
import { addScaledPose, createRigPose, REST_POSE } from './rigPose.ts'

const GESTURES = Object.keys(BLADE_GESTURES) as BladeGesture[]

describe('bladeGestures', () => {
  it.each(GESTURES)('%s: as chaves andam para a frente no tempo', (gesture) => {
    const { blade, sniper } = BLADE_GESTURES[gesture]
    for (const keys of [blade, sniper]) {
      const times = keys.map((key) => key.atS)
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(new Set(times).size).toBe(times.length)
    }
  })

  it('cada golpe é rápido: menos de meio segundo e pouco', () => {
    for (const gesture of GESTURES) expect(gestureDurationS(gesture)).toBeLessThanOrEqual(0.55)
  })

  it('o corte da direita é o espelho do da esquerda', () => {
    const left = sampleTrack(BLADE_GESTURES['slash-left'].blade, 0.17, createRigPose())
    const right = sampleTrack(BLADE_GESTURES['slash-right'].blade, 0.17, createRigPose())
    // o espelho é do corte inteiro, guarda somada: ela não espelha.
    addScaledPose(left, BLADE_GUARDS.katana, 1)
    addScaledPose(right, BLADE_GUARDS.katana, 1)
    expect(right.x).toBeCloseTo(-left.x)
    expect(right.yawRad).toBeCloseTo(-left.yawRad)
    expect(right.y).toBeCloseTo(left.y)
  })
})

describe('sampleTrack', () => {
  const keys = BLADE_GESTURES.holster.sniper

  it('antes da primeira chave vale a primeira, depois da última vale a última', () => {
    expect(sampleTrack(keys, 99, createRigPose())).toEqual(REST_POSE)
    expect(sampleTrack(BLADE_GESTURES.draw.blade, -1, createRigPose()).y).toBeLessThan(0)
  })

  it('no meio, mistura suave entre as duas chaves', () => {
    const middle = sampleTrack(keys, (0.12 + 0.25) / 2, createRigPose())
    expect(middle.y).toBeCloseTo(-0.5 / 2)
  })

  it('trilha vazia é o descanso', () => {
    expect(sampleTrack([], 0.1, createRigPose())).toEqual(REST_POSE)
  })
})

describe('a guarda da lâmina empunhada (playtest de 11/10: "abaixe, ela está muito alta")', () => {
  it('deita a lâmina para a frente, em volta do cotovelo', () => {
    expect(BLADE_GUARDS.katana.pitchRad).toBeGreaterThan(0.4)
  })

  it('o fim do corte, guarda somada, é o mesmo de antes da guarda', () => {
    const follow = sampleTrack(BLADE_GESTURES['slash-left'].blade, 0.16, createRigPose())
    addScaledPose(follow, BLADE_GUARDS.katana, 1)
    expect(follow.pitchRad).toBeCloseTo(0.5)
    expect(follow.yawRad).toBeCloseTo(-0.7)
  })

  it('o golpe rápido não passa por ela; o corte e o saque, sim', () => {
    expect([isQuickGesture('knife-quick'), isQuickGesture('katana-quick')]).toEqual([true, true])
    expect([
      isQuickGesture('slash-left'),
      isQuickGesture('draw'),
      isQuickGesture(undefined),
    ]).toEqual([false, false, false])
  })
})
