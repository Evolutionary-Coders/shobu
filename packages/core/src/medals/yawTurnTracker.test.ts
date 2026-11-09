import { describe, expect, it } from 'vitest'
import { config } from '../bots/botTestKit.ts'
import {
  createSpinTracker,
  createYawTurnTracker,
  noteYaw,
  yawTurnWithin,
} from './yawTurnTracker.ts'

const TICK_S = 1 / 60

/** A mira no rumo `deg`, no plano do chão. Trigonometria só no teste. */
function aimAt(deg: number): { x: number; y: number; z: number } {
  const rad = (deg * Math.PI) / 180
  return { x: Math.cos(rad), y: 0, z: Math.sin(rad) }
}

/** Gira de `fromDeg` até `toDeg` em `ticks` passos, a partir de `startS`. */
function spin(
  tracker: ReturnType<typeof createYawTurnTracker>,
  fromDeg: number,
  toDeg: number,
  ticks: number,
  startS = 0,
): number {
  for (let tick = 0; tick <= ticks; tick += 1) {
    noteYaw(tracker, startS + tick * TICK_S, aimAt(fromDeg + ((toDeg - fromDeg) * tick) / ticks))
  }
  return startS + ticks * TICK_S
}

describe('yawTurnTracker', () => {
  it('uma volta inteira vale 360, de qualquer rumo de partida e para qualquer lado', () => {
    for (const [from, to] of [
      [17, 377],
      [200, -160],
    ] as const) {
      const tracker = createYawTurnTracker(121)
      const endS = spin(tracker, from, to, 60)
      expect(yawTurnWithin(tracker, endS, 2)).toBe(360)
    }
  })

  it('balançar de um lado para o outro soma perto de zero', () => {
    const tracker = createYawTurnTracker(121)
    let atS = spin(tracker, 0, 170, 20)
    atS = spin(tracker, 170, 0, 20, atS + TICK_S)
    atS = spin(tracker, 0, 170, 20, atS + TICK_S)
    atS = spin(tracker, 170, 0, 20, atS + TICK_S)
    expect(yawTurnWithin(tracker, atS, 2)).toBeLessThan(1)
  })

  it('o giro mais velho que a janela não conta', () => {
    const tracker = createYawTurnTracker(400)
    const spunS = spin(tracker, 0, 360, 60)
    for (let tick = 1; tick <= 180; tick += 1) noteYaw(tracker, spunS + tick * TICK_S, aimAt(0))
    expect(yawTurnWithin(tracker, spunS + 180 * TICK_S, 2)).toBe(0)
  })

  it('o giro carimbado depois do agora, de uma partida que já acabou, não conta', () => {
    const tracker = createYawTurnTracker(121)
    spin(tracker, 0, 360, 60, 100)
    noteYaw(tracker, 0, aimAt(0))
    expect(yawTurnWithin(tracker, 0.5, 2)).toBe(0)
  })

  it('mira reta para cima não tem rumo e não quebra a conta', () => {
    const tracker = createYawTurnTracker(121)
    noteYaw(tracker, 0, aimAt(0))
    noteYaw(tracker, TICK_S, { x: 0, y: 1, z: 0 })
    noteYaw(tracker, 2 * TICK_S, aimAt(90))
    expect(yawTurnWithin(tracker, 2 * TICK_S, 2)).toBeCloseTo(90, 9)
  })

  it('o anel cheio esquece a amostra mais velha', () => {
    const tracker = createYawTurnTracker(2)
    noteYaw(tracker, 0, aimAt(0))
    noteYaw(tracker, TICK_S, aimAt(90))
    noteYaw(tracker, 2 * TICK_S, aimAt(180))
    noteYaw(tracker, 3 * TICK_S, aimAt(180))
    expect(yawTurnWithin(tracker, 3 * TICK_S, 2)).toBeCloseTo(90, 9)
  })

  it('o anel do atirador cobre a janela inteira, em dobro', () => {
    const { spinWindowS } = config.medals
    expect(createSpinTracker(config).atS.length).toBe(
      Math.ceil(spinWindowS * config.simulation.tickHz * 2),
    )
  })
})
