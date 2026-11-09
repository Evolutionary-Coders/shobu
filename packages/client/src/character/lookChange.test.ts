import { describe, expect, it } from 'vitest'
import { lookChangeOf } from './lookChange.ts'

describe('lookChangeOf', () => {
  it('veste quem ainda não tem boneco', () => {
    expect(lookChangeOf(undefined, { skin: 'vex', accent: 1 }, false)).toBe('redress')
  })

  it('troca o boneco quando o humano muda', () => {
    expect(lookChangeOf({ skin: 'vex', accent: 1 }, { skin: 'nova', accent: 1 }, false)).toBe(
      'redress',
    )
  })

  it('só repinta quando muda apenas o neon', () => {
    expect(lookChangeOf({ skin: 'vex', accent: 1 }, { skin: 'vex', accent: 2 }, false)).toBe(
      'repaint',
    )
  })

  it('não faz nada quando já está vestido assim', () => {
    expect(lookChangeOf({ skin: 'vex', accent: 1 }, { skin: 'vex', accent: 1 }, false)).toBe('none')
  })

  /** Sem esta guarda, cada quadro do download pedia outro boneco. */
  it('não pede outra troca com uma a caminho', () => {
    expect(lookChangeOf({ skin: 'vex', accent: 1 }, { skin: 'nova', accent: 0 }, true)).toBe('none')
  })
})
