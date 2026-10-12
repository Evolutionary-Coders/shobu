import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createKillNotice } from '../controller/arenaFrameLog.ts'
import { LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import {
  createKillfeed,
  KILLFEED_LIFETIME_MS,
  KILLFEED_NAME_MAX,
  type KillEntry,
  killEntryOf,
} from './killfeed.ts'

/** Fonte de mortes de mentira: o teste escreve o killfeed linha a linha. */
class FakeKillSource {
  private count = 0
  next(over: Partial<KillEntry> = {}): KillEntry {
    this.count += 1
    return {
      killer: `MATADOR${this.count}`,
      victim: `VITIMA${this.count}`,
      weapon: 'sniper',
      tags: [],
      mine: false,
      ...over,
    }
  }
}

describe('os nomes da linha', () => {
  /** Apelido longo empurraria o resto da linha para fora da coluna do visor. */
  it('encurta apelido longo com reticências', () => {
    const long = 'A'.repeat(KILLFEED_NAME_MAX + 6)
    const [line] = createKillfeed().push(new FakeKillSource().next({ killer: long }))
    expect(line?.killer).toBe(`${'A'.repeat(KILLFEED_NAME_MAX - 1)}…`)
  })

  it('deixa apelido no limite exato como está', () => {
    const exact = 'A'.repeat(KILLFEED_NAME_MAX)
    const [line] = createKillfeed().push(new FakeKillSource().next({ victim: exact }))
    expect(line?.victim).toBe(exact)
  })
})

describe('createKillfeed', () => {
  it('põe a morte mais recente no topo', () => {
    const feed = createKillfeed(4)
    const source = new FakeKillSource()
    feed.push(source.next())
    const lines = feed.push(source.next())
    expect(lines[0]?.killer).toBe('MATADOR2')
  })

  it('esquece a linha mais velha quando passa da capacidade', () => {
    const feed = createKillfeed(2)
    const source = new FakeKillSource()
    feed.push(source.next())
    feed.push(source.next())
    const lines = feed.push(source.next())
    expect(lines).toHaveLength(2)
    expect(lines.some((line) => line.killer === 'MATADOR1')).toBe(false)
  })

  it('destaca a linha quando quem matou foi o jogador local', () => {
    const feed = createKillfeed(4)
    const source = new FakeKillSource()
    expect(feed.push(source.next({ mine: true }))[0]?.tone).toBe('mine')
    expect(feed.push(source.next({ mine: false }))[0]?.tone).toBe('theirs')
  })

  it('marca a linha em que o jogador local morreu', () => {
    const feed = createKillfeed(4)
    const source = new FakeKillSource()
    expect(feed.push(source.next({ fatal: true }))[0]?.tone).toBe('fatal')
  })

  it('recusa capacidade que não mostra nada', () => {
    expect(() => createKillfeed(0)).toThrow(/capacity recebeu 0/)
  })
})

/**
 * A linha some por animação de css, e o killfeed não tem relógio: se a duração
 * do css e a constante discordarem, ninguém vê o erro até a linha sumir cedo.
 */
describe('a vida da linha no css', () => {
  it('é a mesma do KILLFEED_LIFETIME_MS', () => {
    const css = readFileSync(new URL('./arenaPanels.css', import.meta.url), 'utf8')
    expect(css).toContain(`animation: kill-line-out ${KILLFEED_LIFETIME_MS}ms linear both`)
  })
})

describe('killEntryOf', () => {
  const names = new Map([
    [LOCAL_PLAYER_ID, 'RAIDEN'],
    ['bot-0', 'ONRYO'],
    ['bot-1', 'VOLT'],
  ])
  const nameOf = (id: string): string => names.get(id) ?? id
  const notice = (over: Partial<ReturnType<typeof createKillNotice>>) => ({
    ...createKillNotice(),
    scoped: true,
    ...over,
  })

  it('a kill de um bot no jogador sai com os nomes da tela, no tom de morte', () => {
    expect(killEntryOf(notice({ shooterId: 'bot-0', victimId: LOCAL_PLAYER_ID }), nameOf)).toEqual({
      killer: 'ONRYO',
      victim: 'RAIDEN',
      weapon: 'sniper',
      tags: ['scoped'],
      mine: false,
      fatal: true,
    })
  })

  it('a kill leva a arma e as marcas de como aconteceu', () => {
    const entry = killEntryOf(
      notice({ shooterId: 'bot-0', victimId: 'bot-1', headshot: true, shooterGrappling: true }),
      nameOf,
    )
    expect(createKillfeed().push(entry)[0]).toMatchObject({
      weapon: 'sniper',
      tags: ['headshot', 'scoped', 'grapple'],
    })
    const katana = killEntryOf(notice({ shooterId: 'bot-0', weapon: 'katana' }), nameOf)
    expect([katana.weapon, katana.tags]).toEqual(['katana', []])
  })

  it('a kill do jogador é dele, e a de bot em bot não é de ninguém', () => {
    expect(
      killEntryOf(notice({ shooterId: LOCAL_PLAYER_ID, victimId: 'bot-1' }), nameOf).mine,
    ).toBe(true)
    const between = killEntryOf(notice({ shooterId: 'bot-1', victimId: 'bot-0' }), nameOf)
    expect([between.mine, between.fatal]).toEqual([false, false])
  })
})
