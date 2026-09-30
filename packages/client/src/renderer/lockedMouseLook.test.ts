import { describe, expect, it } from 'vitest'
import { createLockedMouseLook, type LookTurn, MAX_MOUSE_STEP_PX } from './lockedMouseLook.ts'

function lockedLook() {
  const look = createLockedMouseLook(200)
  look.lockChanged(true)
  look.turn(0, 0, { x: 0, y: 0 })
  return look
}

describe('createLockedMouseLook', () => {
  it('gira pelo movimento sobre o ganho: x do mouse é guinada, y é inclinação', () => {
    const turn: LookTurn = { x: 0, y: 0 }
    expect(lockedLook().turn(20, -4, turn)).toBe(true)
    expect(turn).toEqual({ x: -0.02, y: 0.1 })
  })

  /** Regressão de 29/09: arrasto preso sem trava girava a mira ao voltar para a aba. */
  it('não gira sem o ponteiro travado', () => {
    const look = createLockedMouseLook(200)
    const turn: LookTurn = { x: 0, y: 0 }
    expect(look.turn(20, 0, turn)).toBe(false)
    expect(turn).toEqual({ x: 0, y: 0 })
  })

  it('para de girar quando a trava sai', () => {
    const look = lockedLook()
    look.lockChanged(false)
    expect(look.turn(20, 0, { x: 0, y: 0 })).toBe(false)
  })

  /** Regressão de 29/09: o primeiro evento depois da trava é o salto do cursor no chrome. */
  it('descarta o primeiro evento de cada trava', () => {
    const look = createLockedMouseLook(200)
    look.lockChanged(true)
    expect(look.turn(3, 3, { x: 0, y: 0 })).toBe(false)
    expect(look.turn(3, 3, { x: 0, y: 0 })).toBe(true)
    look.lockChanged(false)
    look.lockChanged(true)
    expect(look.turn(3, 3, { x: 0, y: 0 })).toBe(false)
  })

  it('descarta passo grande demais para ser mão, em qualquer eixo', () => {
    const look = lockedLook()
    expect(look.turn(MAX_MOUSE_STEP_PX + 1, 0, { x: 0, y: 0 })).toBe(false)
    expect(look.turn(0, -MAX_MOUSE_STEP_PX - 1, { x: 0, y: 0 })).toBe(false)
    expect(look.turn(MAX_MOUSE_STEP_PX, 0, { x: 0, y: 0 })).toBe(true)
  })

  it('lê o ganho que o driveLookSensitivity escreveu, a cada evento', () => {
    const look = lockedLook()
    look.angularSensibility = 400
    const turn: LookTurn = { x: 0, y: 0 }
    look.turn(40, 0, turn)
    expect(turn.y).toBe(0.1)
  })
})
