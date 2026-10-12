import { describe, expect, it } from 'vitest'
import { CAPTION_LINE_CHARS, captionOps, wrapCaption } from './visorCaptionOps.ts'
import type { VisorOp } from './visorDraw.ts'

function texts(ops: readonly VisorOp[]): string[] {
  return ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []))
}

describe('wrapCaption', () => {
  it('quebra só em espaço, sem passar da linha', () => {
    expect(wrapCaption('Combatentes prontos. Mapa renderizado.', 24)).toEqual([
      'Combatentes prontos.',
      'Mapa renderizado.',
    ])
  })

  it('palavra maior que a linha fica inteira', () => {
    expect(wrapCaption('a supercalifragilístico b', 6)).toEqual(['a', 'supercalifragilístico', 'b'])
  })

  /** A fala mais longa dos manifestos de hoje cabe em duas linhas. */
  it('a apresentação do ATLAS cabe em duas linhas', () => {
    const intro = 'Olá. Eu sou o ATLAS. Seu assistente pessoal de combate.'
    expect(wrapCaption(intro, CAPTION_LINE_CHARS)).toHaveLength(2)
  })
})

describe('captionOps', () => {
  it('sem fala, nada', () => {
    expect(captionOps(null, 1024)).toEqual([])
  })

  it('a placa por baixo, e as linhas em ordem, a última na base', () => {
    const ops = captionOps('Olá. Eu sou o ATLAS. Seu assistente pessoal de combate.', 1024)
    expect(ops[0]?.kind).toBe('plate')
    expect(texts(ops)).toEqual(['Olá. Eu sou o ATLAS. Seu assistente', 'pessoal de combate.'])
    const [, first, second] = ops
    expect(first?.kind === 'text' && second?.kind === 'text' && first.y < second.y).toBe(true)
  })
})
