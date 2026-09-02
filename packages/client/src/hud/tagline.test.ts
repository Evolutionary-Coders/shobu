import { describe, expect, it } from 'vitest'
import { buildTagline } from './tagline.ts'

describe('buildTagline', () => {
  it('é um lema, não uma lista de regras', () => {
    const tagline = buildTagline()
    expect(tagline).toBe('AQUI NINGUÉM ERRA DUAS VEZES')
    // o `//` era o separador de quando isto eram três frases enfileiradas
    expect(tagline).not.toContain('//')
  })

  /** Cabe na largura do logo: acima disso a tira passa a competir com ele. */
  it('cabe em uma linha', () => {
    expect(buildTagline().length).toBeLessThanOrEqual(34)
  })
})
