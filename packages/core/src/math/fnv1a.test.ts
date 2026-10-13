import { describe, expect, it } from 'vitest'
import { fnv1a32 } from './fnv1a.ts'

describe('fnv1a32', () => {
  it('bate com os vetores de referência do FNV-1a de 32 bits', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
    expect(fnv1a32('foobar')).toBe(0xbf9cf968)
  })

  it('textos diferentes, números diferentes', () => {
    expect(fnv1a32('bot-0')).not.toBe(fnv1a32('bot-1'))
  })
})
