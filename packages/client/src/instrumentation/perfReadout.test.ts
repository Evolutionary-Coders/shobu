import { describe, expect, it } from 'vitest'
import { createFrameStats } from './frameMeter.ts'
import { NULL_LATENCY_SOURCE } from './latencySource.ts'
import { fpsTone, perfReadout, sameReadout } from './perfReadout.ts'

const AT_144 = {
  ...createFrameStats(),
  fps: 143.6,
  meanMs: 6.96,
  medianMs: 1000 / 144,
  fastestMs: 1000 / 144,
}

describe('fpsTone', () => {
  it('é relativa ao monitor: 60 FPS é verde a 60 Hz e vermelho a 144', () => {
    expect(fpsTone(60, 60)).toBe('good')
    expect(fpsTone(60, 144)).toBe('bad')
  })

  it('verde a partir de 90%, amarelo a partir de 60%', () => {
    expect(fpsTone(54, 60)).toBe('good')
    expect(fpsTone(53.9, 60)).toBe('warn')
    expect(fpsTone(36, 60)).toBe('warn')
    expect(fpsTone(35.9, 60)).toBe('bad')
  })

  it('sem taxa do monitor (janela vazia), não acusa nada', () => {
    expect(fpsTone(0, 0)).toBe('good')
  })
})

describe('perfReadout', () => {
  it('mostra o FPS inteiro, o quadro em ms e a cor', () => {
    expect(perfReadout(AT_144, null)).toEqual({
      fps: '144',
      frameMs: '7.0',
      tone: 'good',
      ping: '--',
    })
  })

  it('sem servidor, o ping é -- e nunca um número inventado', () => {
    expect(perfReadout(AT_144, NULL_LATENCY_SOURCE.latencyMs()).ping).toBe('--')
  })

  it('com latência medida, o ping é o número arredondado', () => {
    expect(perfReadout(AT_144, 41.6).ping).toBe('42')
  })

  it('o FPS para em três dígitos', () => {
    expect(perfReadout({ ...AT_144, fps: 2400 }, null).fps).toBe('999')
  })

  it('janela vazia não divide por zero', () => {
    expect(perfReadout(createFrameStats(), null).tone).toBe('good')
  })
})

describe('a taxa do monitor: mediana, com piso de 60 Hz', () => {
  /** Revisão do #23: com a mediana sozinha, 30 FPS estáveis num monitor de 60 Hz saíam brancos. */
  it('30 FPS estáveis é vermelho, não "acompanhando"', () => {
    const halfRate = {
      ...createFrameStats(),
      fps: 30,
      meanMs: 33.3,
      medianMs: 33.3,
      fastestMs: 16.7,
    }
    expect(perfReadout(halfRate, null).tone).toBe('bad')
  })

  /** Revisão do #24: um quadro curto de 13 ms fazia o monitor parecer de 77 Hz. */
  it('60 FPS lisos com um quadro curto na janela continuam brancos', () => {
    const smooth = { ...createFrameStats(), fps: 60, meanMs: 16.7, medianMs: 16.7, fastestMs: 13 }
    expect(perfReadout(smooth, null).tone).toBe('good')
  })

  it('num monitor de 144 Hz liso, a referência sobe com a mediana', () => {
    expect(perfReadout({ ...AT_144, fps: 100 }, null).tone).toBe('warn')
  })
})

describe('sameReadout', () => {
  it('só muda quando o texto ou a cor mudam', () => {
    const now = perfReadout(AT_144, null)
    expect(sameReadout(undefined, now)).toBe(false)
    expect(sameReadout(now, perfReadout({ ...AT_144, fps: 143.9 }, null))).toBe(true)
    expect(sameReadout(now, perfReadout({ ...AT_144, fps: 130 }, null))).toBe(false)
    expect(sameReadout(now, perfReadout(AT_144, 20))).toBe(false)
    expect(sameReadout(now, perfReadout({ ...AT_144, meanMs: 9 }, null))).toBe(false)
  })

  it('a cor sozinha também conta como mudança', () => {
    const now = perfReadout(AT_144, null)
    expect(sameReadout(now, { ...now, tone: 'bad' })).toBe(false)
  })
})
