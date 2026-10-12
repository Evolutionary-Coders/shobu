import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createKillNotice } from '../controller/arenaFrameLog.ts'
import {
  deathScreenKillerOf,
  distanceLabel,
  KILL_BANNER_MS,
  killCardHowLabel,
  killCardOf,
} from './killCards.ts'

/** O cartão some por animação de css: constante e css discordando é cartão que some cedo. */
describe('a vida do cartão de abate no css', () => {
  it.each(['a', 'b'])('killbanner-%s dura KILL_BANNER_MS', (variant) => {
    const css = readFileSync(new URL('./arenaKillBanner.css', import.meta.url), 'utf8')
    expect(css).toContain(`animation: killbanner-${variant} ${KILL_BANNER_MS}ms ease-out both`)
  })
})

describe('killCardOf', () => {
  it('junta o nome, o retrato, a arma, as marcas e a distância', () => {
    const kill = { ...createKillNotice(), headshot: true, scoped: true, distanceM: 86.6 }
    expect(killCardOf(kill, 'NEON KITSUNE', '/kitsune.webp')).toEqual({
      name: 'NEON KITSUNE',
      portraitUrl: '/kitsune.webp',
      weapon: 'sniper',
      tags: ['headshot', 'scoped'],
      distance: '87 M',
    })
  })

  it('sem retrato conhecido, o cartão sai sem ele', () => {
    expect(killCardOf(createKillNotice(), 'X', undefined).portraitUrl).toBeUndefined()
  })
})

describe('distanceLabel', () => {
  it('arredonda ao metro, e nunca fica negativa', () => {
    expect(distanceLabel(1.4)).toBe('1 M')
    expect(distanceLabel(-0.2)).toBe('0 M')
  })
})

describe('killCardHowLabel', () => {
  it('lê os ícones em palavras, com a distância no fim', () => {
    const kill = { ...createKillNotice(), weapon: 'katana' as const, victimAirborne: true }
    expect(killCardHowLabel(killCardOf({ ...kill, distanceM: 2 }, 'X', undefined))).toBe(
      'KATANA · NO AR · 2 M',
    )
  })
})

describe('deathScreenKillerOf', () => {
  it('com a partida correndo, nomeia quem matou', () => {
    expect(deathScreenKillerOf({ killedBy: 'bot-1', matchOver: false })).toBe('bot-1')
    expect(deathScreenKillerOf({ killedBy: null, matchOver: false })).toBeNull()
  })

  it('com o tempo esgotado, ninguém: a tela de MVP é a única no visor', () => {
    // regressão: morrer no último segundo deixava ELIMINADO POR sobre o MVP.
    expect(deathScreenKillerOf({ killedBy: 'bot-1', matchOver: true })).toBeNull()
  })
})
