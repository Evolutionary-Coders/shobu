import { describe, expect, it } from 'vitest'
import {
  bootBarRatio,
  createBootBar,
  createLoadProgress,
  downloadFraction,
} from './loadProgress.ts'

const TASKS = [
  { name: 'arena', weight: 3 },
  { name: 'arma', weight: 1 },
]

describe('createLoadProgress', () => {
  it('começa em zero e incompleta', () => {
    const progress = createLoadProgress(TASKS)
    expect(progress.ratio()).toBe(0)
    expect(progress.isComplete()).toBe(false)
  })

  it('pesa cada tarefa pelo tamanho dela', () => {
    const progress = createLoadProgress(TASKS)
    progress.report('arena', 0.5)
    expect(progress.ratio()).toBeCloseTo(1.5 / 4)
  })

  it('só completa quando todas terminaram', () => {
    const progress = createLoadProgress(TASKS)
    progress.finish('arena')
    expect(progress.isComplete()).toBe(false)
    progress.finish('arma')
    expect(progress.isComplete()).toBe(true)
    expect(progress.ratio()).toBe(1)
  })

  /** Download que recomeça do zero não pode fazer a barra andar para trás. */
  it('nunca volta', () => {
    const progress = createLoadProgress(TASKS)
    progress.report('arma', 0.8)
    progress.report('arma', 0.1)
    expect(progress.ratio()).toBeCloseTo(0.8 / 4)
  })

  it('satura fração fora de 0 a 1 e trata NaN como zero', () => {
    const progress = createLoadProgress(TASKS)
    progress.report('arma', 7)
    progress.report('arena', Number.NaN)
    expect(progress.ratio()).toBeCloseTo(1 / 4)
  })

  it('recusa tarefa desconhecida, dizendo as que existem', () => {
    expect(() => createLoadProgress(TASKS).report('som', 1)).toThrow(
      /tarefa de carga som desconhecida; esperado uma de arena, arma/,
    )
  })

  it('recusa lista vazia e peso que não é positivo', () => {
    expect(() => createLoadProgress([])).toThrow(/recebeu \[\]/)
    expect(() => createLoadProgress([{ name: 'x', weight: 0 }])).toThrow(/tarefa x recebeu peso 0/)
  })
})

describe('onChange', () => {
  it('avisa já com o estado atual, para quem se inscreve tarde', () => {
    const progress = createLoadProgress(TASKS)
    progress.report('arma', 1)
    const seen: [number, boolean][] = []
    progress.onChange((ratio, complete) => seen.push([ratio, complete]))
    expect(seen).toEqual([[0.25, false]])
  })

  it('avisa a cada fração nova e diz quando completou', () => {
    const progress = createLoadProgress(TASKS)
    const seen: boolean[] = []
    progress.onChange((_ratio, complete) => seen.push(complete))
    progress.finish('arena')
    progress.finish('arma')
    expect(seen).toEqual([false, false, true])
  })

  /** Fração repetida não redesenha a barra: o carregador do babylon repete muito. */
  it('não avisa quando a fração não mudou', () => {
    const progress = createLoadProgress(TASKS)
    let calls = 0
    progress.onChange(() => {
      calls += 1
    })
    progress.report('arma', 0)
    expect(calls).toBe(1)
  })
})

describe('bootBarRatio', () => {
  it('é o menor entre a intro impressa e o jogo baixado', () => {
    expect(bootBarRatio(1, 0.4)).toBe(0.4)
    expect(bootBarRatio(0.3, 1)).toBe(0.3)
  })

  it('só chega a 100% quando as duas chegaram', () => {
    expect(bootBarRatio(1, 0.99)).toBeLessThan(1)
    expect(bootBarRatio(1, 1)).toBe(1)
  })

  it('satura os dois lados', () => {
    expect(bootBarRatio(2, 3)).toBe(1)
    expect(bootBarRatio(-1, 0.5)).toBe(0)
  })
})

describe('downloadFraction', () => {
  it('é o baixado sobre o total', () => {
    expect(downloadFraction({ lengthComputable: true, loaded: 5, total: 10 })).toBe(0.5)
  })

  it('é null sem tamanho informado, porque não há fração honesta', () => {
    expect(downloadFraction({ lengthComputable: false, loaded: 5, total: 0 })).toBeNull()
    expect(downloadFraction({ lengthComputable: true, loaded: 5, total: 0 })).toBeNull()
  })
})

describe('createBootBar', () => {
  /** Regressão de 29/09: a intro chegava a 100% com o glb da arena ainda descendo. */
  it('não chega a 100% com a intro impressa e o jogo ainda baixando', () => {
    const drawn: number[] = []
    const bar = createBootBar((ratio) => drawn.push(ratio))
    bar.printed(1)
    bar.loaded(0.6)
    expect(drawn.at(-1)).toBe(0.6)
    bar.loaded(1)
    expect(drawn.at(-1)).toBe(1)
  })

  it('segue a intro quando o download já terminou', () => {
    const drawn: number[] = []
    const bar = createBootBar((ratio) => drawn.push(ratio))
    bar.loaded(1)
    bar.printed(0.3)
    expect(drawn.at(-1)).toBe(0.3)
  })
})
