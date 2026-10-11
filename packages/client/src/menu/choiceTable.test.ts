import { describe, expect, it } from 'vitest'
import {
  type ChoiceSpec,
  choiceLabel,
  defaultChoices,
  parseChoices,
  stepChoice,
} from './choiceTable.ts'

const SPECS: readonly ChoiceSpec<'size' | 'tone'>[] = [
  { key: 'size', label: 'TAMANHO', choices: ['P', 'M', 'G'], fallback: 1 },
  { key: 'tone', label: 'TOM', choices: ['CLARO', 'ESCURO'], fallback: 0 },
]

describe('choiceTable', () => {
  it('o padrão sai da tabela', () => {
    expect(defaultChoices(SPECS)).toEqual({ size: 1, tone: 0 })
  })

  it('lê o guardado, recorta o que passa da lista e ignora o lixo', () => {
    expect(parseChoices({ size: 2, tone: 1 }, SPECS)).toEqual({ size: 2, tone: 1 })
    expect(parseChoices({ size: 9, tone: -3 }, SPECS)).toEqual({ size: 2, tone: 0 })
    expect(parseChoices({ size: '2', tone: 0.5 }, SPECS)).toEqual({ size: 1, tone: 0 })
    expect(parseChoices(null, SPECS)).toEqual({ size: 1, tone: 0 })
  })

  it('a seta anda um e para nas pontas', () => {
    expect(stepChoice({ size: 1, tone: 0 }, SPECS, 'size', 1).size).toBe(2)
    expect(stepChoice({ size: 2, tone: 0 }, SPECS, 'size', 1).size).toBe(2)
    expect(stepChoice({ size: 0, tone: 0 }, SPECS, 'size', -1).size).toBe(0)
  })

  it('escreve o rótulo do valor', () => {
    expect(choiceLabel(SPECS, 'tone', 1)).toBe('ESCURO')
  })

  it('chave que a tabela não tem é erro com a lista do que existe', () => {
    expect(() => choiceLabel(SPECS, 'cor' as 'size', 0)).toThrow(/cor.*size, tone/)
  })
})
