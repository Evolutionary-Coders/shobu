import { describe, expect, it } from 'vitest'
import { choiceScreenRows, stepChoiceScreen } from './choiceScreen.ts'
import type { ChoiceSpec } from './choiceTable.ts'

const SPECS: readonly ChoiceSpec<'size'>[] = [
  { key: 'size', label: 'TAMANHO', choices: ['P', 'M', 'G'], fallback: 1 },
]
const screen = (index: number) => ({ index, values: { size: 1 }, specs: SPECS, actionCount: 2 })

describe('stepChoiceScreen', () => {
  it('conta as linhas de escolha e as de ação', () => {
    expect(choiceScreenRows(SPECS, 2)).toBe(3)
  })

  it('anda e para nas pontas', () => {
    expect(stepChoiceScreen(screen(0), 'up').index).toBe(0)
    expect(stepChoiceScreen(screen(2), 'down').index).toBe(2)
  })

  it('a seta ajusta a escolha, e não faz nada numa linha de ação', () => {
    expect(stepChoiceScreen(screen(0), 'right').values.size).toBe(2)
    expect(stepChoiceScreen(screen(1), 'left').values.size).toBe(1)
  })

  it('confirmar numa linha de ação diz qual; numa escolha, nenhuma', () => {
    expect(stepChoiceScreen(screen(2), 'activate').action).toBe(1)
    expect(stepChoiceScreen(screen(0), 'activate').action).toBeUndefined()
  })

  it('Esc sai da tela', () => {
    expect(stepChoiceScreen(screen(1), 'back').leave).toBe(true)
  })
})
