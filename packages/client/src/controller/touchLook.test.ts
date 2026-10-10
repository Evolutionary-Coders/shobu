import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_SETTINGS } from '../settings/playerSettingsSpec.ts'
import { type TouchLookGain, touchGainFrom, touchLookTurn } from './touchLook.ts'

const PLAIN: TouchLookGain = { pixelsPerRadian: 200, mouseSensitivity: 1, touchSensitivity: 1 }

function turn(x: number, y: number, gain: Partial<TouchLookGain> = {}) {
  return touchLookTurn({ x, y }, { ...PLAIN, ...gain }, { x: 0, y: 0 })
}

describe('touchLookTurn', () => {
  it('arrastar para a direita gira para a direita', () => {
    expect(turn(200, 0).y).toBeCloseTo(1)
  })

  it('arrastar para cima olha para cima: inclinação negativa no babylon', () => {
    expect(turn(0, -100).x).toBeLessThan(0)
  })

  it('a sensibilidade do mouse não acelera o toque: a dele troca a do mouse', () => {
    expect(turn(200, 0, { pixelsPerRadian: 100, mouseSensitivity: 2 }).y).toBeCloseTo(1)
    expect(turn(200, 0, { touchSensitivity: 2 }).y).toBeCloseTo(2)
  })

  it('a luneta, que dobra os pixels por radiano, gira à metade', () => {
    expect(turn(200, 0, { pixelsPerRadian: 400 }).y).toBeCloseTo(0.5)
  })
})

describe('touchGainFrom', () => {
  it('lê a sensibilidade do toque e a do mouse, sobre o ganho de agora', () => {
    const settings = { ...DEFAULT_PLAYER_SETTINGS, touchSensitivity: 1.4 }
    expect(touchGainFrom(settings, 250)).toEqual({
      pixelsPerRadian: 250,
      mouseSensitivity: DEFAULT_PLAYER_SETTINGS.mouseSensitivity,
      touchSensitivity: 1.4,
    })
  })
})
