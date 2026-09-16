import { describe, expect, it } from 'vitest'
import { paintCircuit, paintPanel } from '../arena/cyberspaceSurface.ts'
import { GREYBOX_BLOCKOUT } from '../arena/greyboxBlockout.ts'
import {
  greyboxSurfaceSpec,
  PANEL_LUMINANCE_MAX,
  PANEL_LUMINANCE_MIN,
} from './greyboxSurfaceSpec.ts'

const spec = greyboxSurfaceSpec()
const surfaces = Object.values(spec)

function luminance([red, green, blue]: readonly [number, number, number]): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

describe('greyboxSurfaceSpec', () => {
  /**
   * Camada sem superfície é bloco sem material, e o babylon desenha isso como
   * branco liso — o que ninguém percebe até estar na arena.
   */
  it('cobre toda camada de caixa que o blockout usa', () => {
    for (const layer of new Set(GREYBOX_BLOCKOUT.map((block) => block.layer))) {
      if (layer === 'prop') continue
      expect(spec[layer], `camada ${layer} sem superfície`).toBeDefined()
    }
  })

  /**
   * Prop não é caixa desenhada: ele traz a própria malha e a própria textura no
   * kit. Dar superfície a ele aqui seria pintar textura que ninguém usa.
   */
  it('não dá superfície de caixa ao prop', () => {
    expect(Object.keys(spec)).not.toContain('prop')
  })

  it('pede ladrilho de tamanho positivo', () => {
    for (const { metresPerTile } of surfaces) {
      expect(metresPerTile).toBeGreaterThan(0)
    }
  })
})

/**
 * A faixa do painel é a direção de arte virada regra (ADR 0009).
 *
 * **Teto**: painel claro devolve o cinza de concreto que fez a arena ler como
 * ferro-velho, e estoura sob a chave.
 *
 * **Piso**: painel escuro demais põe a arena inteira abaixo de 0,08, onde
 * monitor de estande em sala acesa não separa nada — e tira do corpo do
 * competidor, que é a coisa mais escura da cena, o fundo contra o qual ele
 * recorta. Era esse o defeito: tudo entre 0,04 e 0,07.
 */
describe('a arena vive na faixa de meio-tom', () => {
  it('todo painel fica dentro da faixa de luminância', () => {
    for (const { panelRgb } of surfaces) {
      const valor = luminance(panelRgb)
      expect(valor, `painel [${panelRgb.join(', ')}] claro demais`).toBeLessThan(
        PANEL_LUMINANCE_MAX,
      )
      expect(valor, `painel [${panelRgb.join(', ')}] escuro demais`).toBeGreaterThanOrEqual(
        PANEL_LUMINANCE_MIN,
      )
    }
  })

  /** Faixa estreita é o que faria a quantização da ADR 0008 esmagar a arena. */
  it('a faixa tem largura para o passe de dither quantizar', () => {
    expect(PANEL_LUMINANCE_MAX / PANEL_LUMINANCE_MIN).toBeGreaterThanOrEqual(2)
  })

  it('a costura é sempre mais escura que o painel que ela separa', () => {
    for (const { panelRgb, seamRgb } of surfaces) {
      expect(luminance(seamRgb)).toBeLessThan(luminance(panelRgb))
    }
  })

  it('todo circuito é mais claro que o painel em que ele corre', () => {
    for (const { panelRgb, circuitRgb } of surfaces) {
      expect(luminance(circuitRgb)).toBeGreaterThan(luminance(panelRgb))
    }
  })

  it('todo circuito é saturado, porque neon é fonte de luz e não tinta', () => {
    for (const { circuitRgb } of surfaces) {
      expect(Math.max(...circuitRgb) - Math.min(...circuitRgb)).toBeGreaterThan(0.3)
    }
  })
})

/**
 * Só a barreira do perímetro deixa o olho passar. Superfície translúcida é
 * cara: ela sai do passe opaco, entra na ordenação por profundidade e passa a
 * depender de ordem de desenho. Vale para o limite da arena, que precisa
 * mostrar a cidade atrás; não vale para piso nem para plataforma.
 */
describe('só a barreira é translúcida', () => {
  it('toda outra camada é opaca', () => {
    for (const [layer, surface] of Object.entries(spec)) {
      if (layer === 'barrier') continue
      expect(surface.panelAlpha, `camada ${layer} translúcida sem motivo`).toBe(1)
    }
  })

  it('a barreira deixa ver através, mas não some', () => {
    expect(spec.barrier.panelAlpha).toBeLessThan(0.3)
    expect(spec.barrier.panelAlpha).toBeGreaterThan(0)
  })
})

/** Duas camadas do mesmo circuito voltam a ser uma caixa lisa só. */
describe('cada camada tem a sua cor', () => {
  it('dá circuito distinto a cada camada', () => {
    const circuits = surfaces.map(({ circuitRgb }) => circuitRgb.join(','))
    expect(new Set(circuits).size).toBe(circuits.length)
  })

  it('dá painel distinto a cada camada', () => {
    const panels = surfaces.map(({ panelRgb }) => panelRgb.join(','))
    expect(new Set(panels).size).toBe(panels.length)
  })
})

/**
 * Toda superfície declarada tem que ser pintável: célula que não divide a
 * textura ou linha mais grossa que a célula só apareceriam na arena, e é o
 * `cyberspaceSurface.ts` que reprova essas duas.
 */
describe('toda superfície declarada pinta', () => {
  it.each(Object.keys(spec))('a camada %s pinta os dois mapas', (layer) => {
    const surface = spec[layer as keyof typeof spec]
    expect(() => paintPanel(surface)).not.toThrow()
    expect(() => paintCircuit(surface)).not.toThrow()
  })
})
