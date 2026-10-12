import { describe, expect, it } from 'vitest'
import { revealScrollTop } from './panelReveal.ts'

const PANEL = { scrollTop: 100, clientHeight: 300, scrollHeight: 900 }

describe('revealScrollTop', () => {
  it('a linha já à vista não mexe no painel: nada de pular a cada seta', () => {
    expect(revealScrollTop(PANEL, { top: 200, height: 30 }, 30)).toBe(100)
  })

  it('a linha abaixo da janela puxa o painel só até caber com a margem', () => {
    expect(revealScrollTop(PANEL, { top: 400, height: 30 }, 30)).toBe(160)
  })

  it('a linha acima da janela puxa o painel de volta, com a margem', () => {
    expect(revealScrollTop(PANEL, { top: 110, height: 30 }, 30)).toBe(80)
  })

  it('não rola antes do começo nem depois do fim', () => {
    expect(revealScrollTop(PANEL, { top: 10, height: 30 }, 30)).toBe(0)
    expect(revealScrollTop(PANEL, { top: 880, height: 30 }, 30)).toBe(600)
  })

  it('painel sem sobra não rola', () => {
    const fits = { scrollTop: 0, clientHeight: 300, scrollHeight: 300 }
    expect(revealScrollTop(fits, { top: 280, height: 30 }, 30)).toBe(0)
  })
})
