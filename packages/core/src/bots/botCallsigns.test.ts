import { describe, expect, it } from 'vitest'
import { BOT_CALLSIGNS, botCallsigns } from './botCallsigns.ts'

describe('botCallsigns', () => {
  it('dá a quantidade pedida, sem repetir', () => {
    const names = botCallsigns(3, 7)
    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(3)
  })

  /** O servidor e o cliente sorteiam com a mesma semente e chegam aos mesmos nomes. */
  it('a mesma semente dá os mesmos nomes, e outra semente muda', () => {
    expect(botCallsigns(3, 20_251_119)).toEqual(botCallsigns(3, 20_251_119))
    expect(botCallsigns(BOT_CALLSIGNS.length, 1)).not.toEqual(botCallsigns(BOT_CALLSIGNS.length, 2))
  })

  it('a lista inteira cabe, e nenhum nome some no embaralhamento', () => {
    expect([...botCallsigns(BOT_CALLSIGNS.length, 3)].sort()).toEqual([...BOT_CALLSIGNS].sort())
  })

  /** 12 é o `KILLFEED_NAME_MAX`: acima disso o killfeed corta o nome com reticências. */
  it('todo nome cabe no killfeed e nenhum se passa pelo jogador', () => {
    for (const name of BOT_CALLSIGNS) {
      expect([...name].length, name).toBeLessThanOrEqual(12)
      expect(name).not.toBe('VOCÊ')
    }
  })

  it.each([-1, 1.5, BOT_CALLSIGNS.length + 1])('recusa count %s', (count) => {
    expect(() => botCallsigns(count, 1)).toThrow(/esperado inteiro de 0 a 16/)
  })
})
