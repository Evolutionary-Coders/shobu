import { describe, expect, it } from 'vitest'
import { arenaFogSpec } from './arenaFogSpec.ts'
import {
  bandBoostAt,
  deadChannelSkySpec,
  grainFrameAt,
  paintDeadChannel,
  relativeLuminance,
  rollOffsetAt,
  SKY_LUMINANCE_MAX,
  skyColourAt,
} from './deadChannelSky.ts'

/** Chuvisco fixo, para a textura sair igual duas vezes e o teste poder medir. */
function steadyGrain(value: number): () => number {
  return () => value
}

describe('deadChannelSkySpec', () => {
  const spec = deadChannelSkySpec()

  /** Cor de névoa diferente da cor do horizonte devolve a linha do horizonte. */
  it('o horizonte é a mesma cor da névoa', () => {
    expect(spec.horizonRgb).toEqual(arenaFogSpec().colorRgb)
  })

  it('o zênite é mais escuro que o horizonte', () => {
    expect(relativeLuminance(spec.zenithRgb)).toBeLessThan(relativeLuminance(spec.horizonRgb))
  })

  /** Chuvisco por quadro deixa de ler como tv e vira ruído de renderizador. */
  it('o chuvisco troca devagar, não por quadro', () => {
    expect(spec.grainHz).toBeGreaterThan(0)
    expect(spec.grainHz).toBeLessThan(30)
  })
})

/**
 * O teto de luminância é a regra de jogabilidade deste módulo: o céu é o fundo
 * de toda silhueta da camada `top`, e céu claro apaga alvo. Vale para o
 * gradiente inteiro, com chuvisco e banda no pior caso somados.
 */
describe('o céu fica escuro o bastante para a silhueta ler', () => {
  const spec = deadChannelSkySpec()

  it.each([0, 0.25, 0.5, 0.75, 1])('a altura %s está abaixo do teto', (v) => {
    const worstCase = skyColourAt(spec, v).map(
      (channel) => channel + spec.bandAmplitude + spec.grainAmplitude / 2,
    ) as unknown as readonly [number, number, number]
    expect(relativeLuminance(worstCase)).toBeLessThan(SKY_LUMINANCE_MAX)
  })
})

describe('skyColourAt', () => {
  const spec = deadChannelSkySpec()

  it('no equador devolve o horizonte', () => {
    expect(skyColourAt(spec, 0.5)).toEqual(spec.horizonRgb)
  })

  it('no topo devolve o zênite', () => {
    const [red, green, blue] = skyColourAt(spec, 1)
    const [zenithR, zenithG, zenithB] = spec.zenithRgb
    expect(red).toBeCloseTo(zenithR, 6)
    expect(green).toBeCloseTo(zenithG, 6)
    expect(blue).toBeCloseTo(zenithB, 6)
  })

  /** Abaixo do equador fica o piso da arena: gradiente ali só gastaria cor. */
  it('abaixo do equador a cor não muda', () => {
    expect(skyColourAt(spec, 0)).toEqual(spec.horizonRgb)
    expect(skyColourAt(spec, 0.25)).toEqual(spec.horizonRgb)
  })

  it('escurece sem voltar atrás subindo do horizonte ao zênite', () => {
    const rungs = [0.5, 0.6, 0.7, 0.8, 0.9, 1].map((v) => relativeLuminance(skyColourAt(spec, v)))
    for (const [step, luminance] of rungs.slice(1).entries()) {
      expect(luminance).toBeLessThanOrEqual(rungs[step] as number)
    }
  })
})

describe('grainFrameAt', () => {
  const spec = deadChannelSkySpec()

  it('conta um quadro por período de chuvisco', () => {
    expect(grainFrameAt(spec, 0)).toBe(0)
    expect(grainFrameAt(spec, 1)).toBe(spec.grainHz)
  })

  it('não troca de quadro dentro do mesmo período', () => {
    expect(grainFrameAt(spec, 0.01)).toBe(grainFrameAt(spec, 0.09))
  })
})

describe('rollOffsetAt', () => {
  const spec = deadChannelSkySpec()

  it('começa no zero e fica dentro de uma volta', () => {
    expect(rollOffsetAt(spec, 0)).toBe(0)
    for (const elapsedS of [1, 7.5, 60, 601.25]) {
      expect(rollOffsetAt(spec, elapsedS)).toBeGreaterThanOrEqual(0)
      expect(rollOffsetAt(spec, elapsedS)).toBeLessThan(1)
    }
  })

  it('completa uma volta no período da banda', () => {
    expect(rollOffsetAt(spec, 0.5 / spec.rollHz)).toBeCloseTo(0.5, 6)
  })
})

describe('bandBoostAt', () => {
  const spec = deadChannelSkySpec()

  it('clareia o máximo no centro da banda', () => {
    expect(bandBoostAt(spec, 0.5, 0.5)).toBeCloseTo(spec.bandAmplitude, 6)
  })

  it('não clareia nada longe da banda', () => {
    expect(bandBoostAt(spec, 0.5, 0.0)).toBe(0)
  })

  /** A textura fecha em volta da esfera: a banda que sai por cima entra por baixo. */
  it('atravessa a emenda da textura', () => {
    expect(bandBoostAt(spec, 0.99, 0.01)).toBeGreaterThan(0)
  })

  it('cai sem voltar atrás do centro para a borda', () => {
    const centre = bandBoostAt(spec, 0.5, 0.5)
    const meio = bandBoostAt(spec, 0.54, 0.5)
    const borda = bandBoostAt(spec, 0.58, 0.5)
    expect(meio).toBeLessThan(centre)
    expect(borda).toBeLessThan(meio)
  })
})

describe('paintDeadChannel', () => {
  const spec = deadChannelSkySpec()
  const [width, height] = spec.sizePx

  it('devolve rgba de cada texel da textura', () => {
    expect(paintDeadChannel(spec, steadyGrain(0.5), 0)).toHaveLength(width * height * 4)
  })

  it('deixa tudo opaco, senão o céu vaza o clearColor', () => {
    const pixels = paintDeadChannel(spec, steadyGrain(0.5), 0)
    for (let texel = 3; texel < pixels.length; texel += 4) {
      expect(pixels[texel]).toBe(255)
    }
  })

  /** Chuvisco com cor por canal vira confete: tv fora do ar não tem croma. */
  it('o chuvisco é monocromático', () => {
    const pixels = paintDeadChannel(spec, Math.random, 0)
    const [horizonR, horizonG, horizonB] = spec.horizonRgb
    for (let texel = 0; texel < 40 * 4; texel += 4) {
      const red = (pixels[texel] ?? 0) / 255 - horizonR
      const green = (pixels[texel + 1] ?? 0) / 255 - horizonG
      const blue = (pixels[texel + 2] ?? 0) / 255 - horizonB
      expect(green).toBeCloseTo(red, 1)
      expect(blue).toBeCloseTo(red, 1)
    }
  })

  it('a banda clareia a linha por onde passa', () => {
    const semBanda = paintDeadChannel(spec, steadyGrain(0.5), 0.9)
    const comBanda = paintDeadChannel(spec, steadyGrain(0.5), 0.5)
    const meio = Math.floor(height / 2) * width * 4
    expect(comBanda[meio] as number).toBeGreaterThan(semBanda[meio] as number)
  })

  it('nenhum canal sai da faixa de um byte, nem com chuvisco no extremo', () => {
    for (const grain of [0, 1]) {
      const pixels = paintDeadChannel(spec, steadyGrain(grain), 0.5)
      for (const channel of pixels) {
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
      }
    }
  })

  it('recusa textura sem tamanho', () => {
    expect(() => paintDeadChannel({ ...spec, sizePx: [0, 8] }, steadyGrain(0.5), 0)).toThrow(
      /sizePx recebeu \[0, 8\]/,
    )
    expect(() => paintDeadChannel({ ...spec, sizePx: [8, 0] }, steadyGrain(0.5), 0)).toThrow(
      /sizePx recebeu \[8, 0\]/,
    )
  })
})
