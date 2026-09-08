import { describe, expect, it } from 'vitest'
import { buildTagline } from './tagline.ts'

describe('buildTagline', () => {
  it('é um lema, não uma lista de regras', () => {
    const tagline = buildTagline()
    expect(tagline).toBe('// ONE SHOT. ONE KILL')
    // o `//` é prefixo de canal, como no roteiro do boot. como separador ele
    // voltaria a picar o lema em lista — então só pode aparecer uma vez, na frente.
    expect(tagline.indexOf('//')).toBe(0)
    expect(tagline.lastIndexOf('//')).toBe(0)
  })

  /** Cabe na largura do logo: acima disso a tira passa a competir com ele. */
  it('cabe em uma linha', () => {
    expect(buildTagline().length).toBeLessThanOrEqual(34)
  })
})
