import { describe, expect, it } from 'vitest'
import { TIME_TO_CONTROL_BUDGET_MS } from '../instrumentation/timeToPlayerControl.ts'
import {
  buildGlitchBands,
  buildJackInReadout,
  GLITCH_BAND_COUNT,
  glitchDurationMs,
  JACK_IN_MS,
  JACK_IN_REDUCED_MS,
  jackInDurationMs,
} from './jackIn.ts'

const SEED = 20_251_119

const shippedBands = () => buildGlitchBands({ count: GLITCH_BAND_COUNT, seed: SEED })

describe('buildGlitchBands', () => {
  it('devolve uma faixa por pedido', () => {
    expect(buildGlitchBands({ count: 3, seed: SEED })).toHaveLength(3)
  })

  /**
   * F.I.R.S.T: a mesma semente tem que dar as mesmas faixas, senão os testes de
   * orçamento abaixo passam ou falham por sorteio.
   */
  it('é repetível para a mesma semente', () => {
    expect(buildGlitchBands({ count: 4, seed: SEED })).toEqual(
      buildGlitchBands({ count: 4, seed: SEED }),
    )
  })

  it('muda de sorteio quando a semente muda', () => {
    const first = buildGlitchBands({ count: 5, seed: SEED })
    const second = buildGlitchBands({ count: 5, seed: SEED + 1 })
    expect(first).not.toEqual(second)
  })

  /**
   * Duas faixas na mesma altura viram uma faixa grossa, e faixa grossa é
   * cortina: a arena tem que aparecer entre elas. Cada faixa fica na própria
   * fatia da tela, em ordem, sem invadir a de baixo.
   */
  it('espalha as faixas pela altura sem sobreposição', () => {
    const bands = shippedBands()
    for (let index = 1; index < bands.length; index += 1) {
      const above = bands[index - 1]
      const below = bands[index]
      if (!above || !below) throw new Error(`faixa ${index} ausente`)
      expect(below.topPct).toBeGreaterThan(above.topPct + above.heightVh)
    }
  })

  it('alterna a direção da varredura', () => {
    const directions = shippedBands().map((band) => band.direction)
    expect(directions).toEqual([1, -1, 1, -1, 1])
  })

  it('recusa contagem que não desenha nada', () => {
    expect(() => buildGlitchBands({ count: 0, seed: SEED })).toThrow(/count recebeu 0/)
  })
})

describe('glitchDurationMs', () => {
  /**
   * A interferência não pode terminar depois da tela sair: faixa ainda varrendo
   * quando o overlay some vira corte seco no meio da animação. E ela precisa
   * acabar **antes** da mira travar (800ms em jackIn.css) — a trava é o fim da
   * transição, e ruído em cima dela é ruído em cima do único instrumento que
   * sobrevive.
   */
  it('termina antes da mira travar', () => {
    expect(glitchDurationMs(shippedBands())).toBeLessThanOrEqual(800)
  })

  it('soma atraso e varredura da faixa mais tardia', () => {
    const bands = [
      { topPct: 5, heightVh: 2, delayMs: 10, durationMs: 100, direction: 1 as const },
      { topPct: 40, heightVh: 2, delayMs: 200, durationMs: 300, direction: -1 as const },
      { topPct: 80, heightVh: 2, delayMs: 50, durationMs: 120, direction: 1 as const },
    ]
    expect(glitchDurationMs(bands)).toBe(500)
  })
})

/**
 * O pilar 2 mede do clique no link ao controle do personagem, e o salto começa
 * **depois** desse instante — ele não entra na conta dos cinco segundos. O que
 * estes testes guardam é o outro lado: o salto acontece por cima de uma arena
 * já jogável, então ele tem que ser curto o bastante para não virar cutscene
 * disfarçada. Um quinto do orçamento do pilar é o teto.
 */
describe('orçamento da transição', () => {
  it('não vira cutscene disfarçada de transição', () => {
    expect(JACK_IN_MS).toBeLessThanOrEqual(TIME_TO_CONTROL_BUDGET_MS / 5)
  })

  it('é ainda mais curta para quem pediu menos movimento', () => {
    expect(JACK_IN_REDUCED_MS).toBeLessThan(JACK_IN_MS)
  })

  /**
   * A tela sai quando o css termina, e o css termina mais cedo sem a
   * coreografia. Se os dois lados se desencontrarem, o jogador fica olhando uma
   * tela morta com o jogo rodando atrás — o defeito que esta escolha evita.
   */
  it('espera a coreografia que o css vai mesmo rodar', () => {
    expect(jackInDurationMs(false)).toBe(JACK_IN_MS)
    expect(jackInDurationMs(true)).toBe(JACK_IN_REDUCED_MS)
  })
})

describe('buildJackInReadout', () => {
  it('fecha a ficção do corpo emprestado', () => {
    expect(buildJackInReadout().join('\n')).toContain('CORPO')
  })

  /**
   * O que alinha a tela não é onde o pontilhado começa, é onde o valor cai —
   * é a coluna que o `dottedField` fixa, e é ela que faz o mostrador ler como
   * continuação do trilho esquerdo em vez de legenda solta.
   */
  it('põe todos os valores na mesma coluna do roteiro do boot', () => {
    const columns = buildJackInReadout().map((text) => text.lastIndexOf('.'))
    expect(new Set(columns).size).toBe(1)
  })
})
