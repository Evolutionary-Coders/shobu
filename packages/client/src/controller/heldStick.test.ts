import { describe, expect, it } from 'vitest'
import { createHeldStick, STICK_DEAD_ZONE, stickFromAxes } from './heldStick.ts'

describe('stickFromAxes', () => {
  it('nasce parado', () => {
    expect(createHeldStick()).toEqual({ ahead: 0, side: 0 })
  })

  it('para a frente é y negativo, como no gamepad standard', () => {
    const stick = stickFromAxes(0, -1, createHeldStick())
    expect(stick.ahead).toBeCloseTo(1)
    expect(stick.side).toBeCloseTo(0)
  })

  it('direita é x positivo', () => {
    const stick = stickFromAxes(1, 0, createHeldStick())
    expect(stick.side).toBeCloseTo(1)
    expect(stick.ahead).toBeCloseTo(0)
  })

  it('dentro da zona morta, zera mesmo vindo de um valor antigo', () => {
    const stick = { ahead: 0.8, side: -0.3 }
    expect(stickFromAxes(STICK_DEAD_ZONE * 0.9, 0, stick)).toEqual({ ahead: 0, side: 0 })
  })

  it('sair da zona morta começa perto de zero, não em 12%', () => {
    const stick = stickFromAxes(STICK_DEAD_ZONE + 0.01, 0, createHeldStick())
    expect(stick.side).toBeGreaterThan(0)
    expect(stick.side).toBeLessThan(0.02)
  })

  it('meio curso é meia velocidade, depois da zona morta', () => {
    const half = STICK_DEAD_ZONE + (1 - STICK_DEAD_ZONE) / 2
    expect(stickFromAxes(0, -half, createHeldStick()).ahead).toBeCloseTo(0.5)
  })

  it('a diagonal física (quina do quadrado) não passa de 1', () => {
    const stick = stickFromAxes(1, -1, createHeldStick())
    expect(Math.hypot(stick.ahead, stick.side)).toBeCloseTo(1)
  })

  it('escreve no objeto recebido em vez de alocar', () => {
    const into = createHeldStick()
    expect(stickFromAxes(0.5, 0.5, into)).toBe(into)
  })
})
