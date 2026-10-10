import { describe, expect, it } from 'vitest'
import {
  BASE_PIXELS_PER_RADIAN,
  STICK_LOOK_MAX_RAD_PER_S,
  type StickGain,
  stickLookTurn,
} from './stickLook.ts'

const PLAIN: StickGain = {
  pixelsPerRadian: BASE_PIXELS_PER_RADIAN,
  mouseSensitivity: 1,
  stickSensitivity: 1,
  invertY: false,
}

function turn(ahead: number, side: number, gain: Partial<StickGain> = {}, dtS = 1) {
  return stickLookTurn({ ahead, side }, { ...PLAIN, ...gain }, dtS, { x: 0, y: 0 })
}

describe('stickLookTurn', () => {
  it('parado, não gira', () => {
    const still = turn(0, 0)
    expect([still.x + 0, still.y + 0]).toEqual([0, 0])
  })

  it('no fim do curso, gira na velocidade máxima', () => {
    expect(turn(0, 1).y).toBeCloseTo(STICK_LOOK_MAX_RAD_PER_S)
  })

  it('direita gira para a direita, esquerda para a esquerda', () => {
    expect(turn(0, 1).y).toBeGreaterThan(0)
    expect(turn(0, -1).y).toBeLessThan(0)
  })

  it('para cima olha para cima: inclinação negativa no babylon', () => {
    expect(turn(1, 0).x).toBeLessThan(0)
    expect(turn(-1, 0).x).toBeGreaterThan(0)
  })

  it('meio curso gira a um quarto: a resposta é quadrática', () => {
    expect(turn(0, 0.5).y).toBeCloseTo(STICK_LOOK_MAX_RAD_PER_S / 4)
  })

  it('segue o ganho do mouse: a luneta, que dobra os pixels por radiano, gira à metade', () => {
    expect(turn(0, 1, { pixelsPerRadian: BASE_PIXELS_PER_RADIAN * 2 }).y).toBeCloseTo(
      STICK_LOOK_MAX_RAD_PER_S / 2,
    )
  })

  it('a sensibilidade do mouse não acelera o analógico: a dele troca a do mouse', () => {
    const mouseRapido = { pixelsPerRadian: BASE_PIXELS_PER_RADIAN / 2, mouseSensitivity: 2 }
    expect(turn(0, 1, mouseRapido).y).toBeCloseTo(STICK_LOOK_MAX_RAD_PER_S)
    expect(turn(0, 1, { stickSensitivity: 2 }).y).toBeCloseTo(STICK_LOOK_MAX_RAD_PER_S * 2)
  })

  it('com o vertical invertido, para cima olha para baixo', () => {
    expect(turn(1, 0, { invertY: true }).x).toBeGreaterThan(0)
  })

  it('escala com o tempo do quadro', () => {
    expect(turn(0, 1, {}, 1 / 60).y).toBeCloseTo(STICK_LOOK_MAX_RAD_PER_S / 60)
  })

  it('escreve no objeto recebido em vez de alocar', () => {
    const into = { x: 0, y: 0 }
    expect(stickLookTurn({ ahead: 0, side: 0 }, PLAIN, 1, into)).toBe(into)
  })
})
