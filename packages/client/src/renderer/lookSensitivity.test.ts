import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYER_SETTINGS } from '../settings/playerSettingsSpec.ts'
import {
  BASE_PIXELS_PER_RADIAN,
  fovLookCoefficient,
  lookPixelsPerRadian,
} from './lookSensitivity.ts'

const HIP_DEG = 90
const SCOPED_DEG = 22

function gainAt(currentFovDeg: number, scopeBlend: number, overrides = {}) {
  return {
    currentFovDeg,
    baseFovDeg: HIP_DEG,
    scopeBlend,
    settings: { ...DEFAULT_PLAYER_SETTINGS, ...overrides },
  }
}

describe('fovLookCoefficient', () => {
  it('é 1 quando o fov é o de quadril: nada a compensar', () => {
    expect(fovLookCoefficient(HIP_DEG, HIP_DEG)).toBeCloseTo(1, 12)
  })

  /** `tan(11°) / tan(45°)` — o zoom angular que o simulation-model lista. */
  it('cai com o campo fechado, na razão das tangentes de meio ângulo', () => {
    const esperado = Math.tan((SCOPED_DEG * Math.PI) / 360) / Math.tan((HIP_DEG * Math.PI) / 360)
    expect(fovLookCoefficient(SCOPED_DEG, HIP_DEG)).toBeCloseTo(esperado, 12)
  })

  it('é monotônico: campo mais fechado nunca devolve coeficiente maior', () => {
    let anterior = Number.POSITIVE_INFINITY
    for (let fov = 120; fov >= 22; fov -= 1) {
      const atual = fovLookCoefficient(fov, HIP_DEG)
      expect(atual).toBeLessThan(anterior)
      anterior = atual
    }
  })

  it.each([0, -10, 180, 200])('recusa fov de %s dizendo o que recebeu', (fov) => {
    expect(() => fovLookCoefficient(fov, HIP_DEG)).toThrow(/recebeu/)
  })

  it('recusa fov de quadril fora da faixa também', () => {
    expect(() => fovLookCoefficient(HIP_DEG, 0)).toThrow(/recebeu 0/)
  })
})

describe('lookPixelsPerRadian', () => {
  it('no quadril, com tudo no padrão, é a linha de base intacta', () => {
    expect(lookPixelsPerRadian(gainAt(HIP_DEG, 0))).toBeCloseTo(BASE_PIXELS_PER_RADIAN, 9)
  })

  /**
   * O campo do babylon é **pixels por radiano**: maior é mais lento. Sensibilidade
   * maior tem que baixar o número, e é o erro de sinal que este teste vigia.
   */
  it('sensibilidade maior diminui os pixels por radiano', () => {
    const rapido = lookPixelsPerRadian(gainAt(HIP_DEG, 0, { mouseSensitivity: 2 }))
    const lento = lookPixelsPerRadian(gainAt(HIP_DEG, 0, { mouseSensitivity: 0.5 }))
    expect(rapido).toBeLessThan(BASE_PIXELS_PER_RADIAN)
    expect(lento).toBeGreaterThan(BASE_PIXELS_PER_RADIAN)
  })

  it('dobrar a sensibilidade dobra a velocidade da mira', () => {
    const base = lookPixelsPerRadian(gainAt(HIP_DEG, 0))
    const dobro = lookPixelsPerRadian(gainAt(HIP_DEG, 0, { mouseSensitivity: 2 }))
    expect(base / dobro).toBeCloseTo(2, 9)
  })

  /**
   * A promessa que o número 1,00 faz ao jogador: **a mesma distância na tela por
   * centímetro de mouse**, com e sem luneta. Quebrar isto é quebrar a única
   * definição de sensibilidade de mira que dá para explicar.
   */
  it('com a luneta e o ajuste em 1,00, o alvo anda a mesma distância na tela', () => {
    const noQuadril = lookPixelsPerRadian(gainAt(HIP_DEG, 0))
    const naLuneta = lookPixelsPerRadian(gainAt(SCOPED_DEG, 1))
    const zoom = fovLookCoefficient(SCOPED_DEG, HIP_DEG)
    // o ganho angular cai na mesma proporção em que a lente amplia.
    expect(noQuadril / naLuneta).toBeCloseTo(zoom, 9)
  })

  it('o ajuste da luneta só vale com ela aberta', () => {
    const fechada = lookPixelsPerRadian(gainAt(HIP_DEG, 0, { scopeSensitivity: 0.5 }))
    expect(fechada).toBeCloseTo(BASE_PIXELS_PER_RADIAN, 9)
  })

  it('o ajuste da luneta entra proporcional à rampa, sem degrau', () => {
    const meio = lookPixelsPerRadian(gainAt(HIP_DEG, 0.5, { scopeSensitivity: 0.5 }))
    const cheio = lookPixelsPerRadian(gainAt(HIP_DEG, 1, { scopeSensitivity: 0.5 }))
    expect(meio).toBeGreaterThan(BASE_PIXELS_PER_RADIAN)
    expect(meio).toBeLessThan(cheio)
  })

  it.each([-1, 2])('rampa fora de 0 a 1 (%s) é recortada em vez de extrapolar', (blend) => {
    const recortado = lookPixelsPerRadian(gainAt(HIP_DEG, blend, { scopeSensitivity: 0.5 }))
    const limite = lookPixelsPerRadian(
      gainAt(HIP_DEG, blend < 0 ? 0 : 1, { scopeSensitivity: 0.5 }),
    )
    expect(recortado).toBeCloseTo(limite, 9)
  })

  it('não depende do fov de quadril escolhido: 60 e 120 dão o mesmo no quadril', () => {
    const estreito = { ...gainAt(60, 0), baseFovDeg: 60 }
    const largo = { ...gainAt(120, 0), baseFovDeg: 120 }
    expect(lookPixelsPerRadian(estreito)).toBeCloseTo(lookPixelsPerRadian(largo), 9)
  })
})
