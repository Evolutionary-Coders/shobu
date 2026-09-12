import { describe, expect, it } from 'vitest'
import { createKillfeed, formatKillLine, KILLFEED_NAME_MAX, type KillEntry } from './killfeed.ts'

/** Fonte de mortes de mentira: o teste escreve o killfeed linha a linha. */
class FakeKillSource {
  private count = 0
  next(over: Partial<KillEntry> = {}): KillEntry {
    this.count += 1
    return {
      killer: `MATADOR${this.count}`,
      victim: `VITIMA${this.count}`,
      weapon: 'SNIPER',
      mine: false,
      ...over,
    }
  }
}

describe('formatKillLine', () => {
  it('escreve quem matou, o símbolo e quem morreu', () => {
    expect(formatKillLine({ killer: 'VOCÊ', victim: 'ONRYO', weapon: 'SNIPER', mine: true })).toBe(
      'VOCÊ ✕ ONRYO',
    )
  })

  /** Apelido longo empurraria o resto da linha para fora da coluna do visor. */
  it('encurta apelido longo com reticências', () => {
    const long = 'A'.repeat(KILLFEED_NAME_MAX + 6)
    const line = formatKillLine({ killer: long, victim: 'B', weapon: 'SNIPER', mine: false })
    expect(line.startsWith(`${'A'.repeat(KILLFEED_NAME_MAX - 1)}…`)).toBe(true)
  })

  it('deixa apelido no limite exato como está', () => {
    const exact = 'A'.repeat(KILLFEED_NAME_MAX)
    expect(formatKillLine({ killer: exact, victim: 'B', weapon: 'SNIPER', mine: false })).toContain(
      exact,
    )
  })
})

describe('createKillfeed', () => {
  it('põe a morte mais recente no topo', () => {
    const feed = createKillfeed(4)
    const source = new FakeKillSource()
    feed.push(source.next())
    const lines = feed.push(source.next())
    expect(lines[0]?.text).toContain('MATADOR2')
  })

  it('esquece a linha mais velha quando passa da capacidade', () => {
    const feed = createKillfeed(2)
    const source = new FakeKillSource()
    feed.push(source.next())
    feed.push(source.next())
    const lines = feed.push(source.next())
    expect(lines).toHaveLength(2)
    expect(lines.some((line) => line.text.includes('MATADOR1'))).toBe(false)
  })

  it('destaca a linha quando quem matou foi o jogador local', () => {
    const feed = createKillfeed(4)
    const source = new FakeKillSource()
    expect(feed.push(source.next({ mine: true }))[0]?.tone).toBe('mine')
    expect(feed.push(source.next({ mine: false }))[0]?.tone).toBe('theirs')
  })

  it('recusa capacidade que não mostra nada', () => {
    expect(() => createKillfeed(0)).toThrow(/capacity recebeu 0/)
  })
})
