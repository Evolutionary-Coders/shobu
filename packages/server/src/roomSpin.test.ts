import { describe, expect, it } from 'vitest'
import { duel, FIRE_WIRE, open, seat, wire } from './roomDuelFixture.ts'
import { stepRoom } from './roomSimulation.ts'

const WIRE_UNIT = 32767

/** A mira do fio no rumo `deg`, de -z girando para +x. Trigonometria só no teste. */
function aimTurnedBy(deg: number): { aimX: number; aimY: number; aimZ: number } {
  const rad = (deg * Math.PI) / 180
  return {
    aimX: Math.round(Math.sin(rad) * WIRE_UNIT),
    aimY: 0,
    aimZ: -Math.round(Math.cos(rad) * WIRE_UNIT),
  }
}

describe('o giro do 360-no-scope, na sala', () => {
  it('a volta inteira da mira antes do tiro vai na kill', () => {
    const { room, io } = duel()
    const steps = 40
    // um input por tick, como o cliente manda: a fila parada a sala descarta.
    for (let step = 0; step < steps; step += 1) {
      io.push('ana', wire({}, aimTurnedBy((360 * step) / steps)))
      stepRoom(room, io, open)
    }
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(seat(room, 'bia').fighter.alive).toBe(false)
    expect(io.kills[0]?.shooterYawTurnDeg).toBeCloseTo(360, 0)
  })

  it('sem girar, o tiro leva giro nenhum', () => {
    const { room, io } = duel()
    io.push('ana', FIRE_WIRE)
    stepRoom(room, io, open)
    expect(io.kills[0]?.shooterYawTurnDeg).toBe(0)
  })
})
