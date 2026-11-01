import { AFK_CLOSE_CODE } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { roomCloseNotice } from './roomCloseNotice.ts'

describe('roomCloseNotice', () => {
  it('a saída por inatividade ganha nota no menu', () => {
    expect(roomCloseNotice(AFK_CLOSE_CODE)).toBe('VOCÊ FOI REMOVIDO POR INATIVIDADE')
  })

  /** Regressão: a queda pelo heartbeat era calada, e o jogo seguia sozinho com o placar parado. */
  it('a queda da conexão ganha nota no menu', () => {
    expect(roomCloseNotice(1006)).toBe('A CONEXÃO COM O SERVIDOR CAIU')
  })

  it('o servidor desligando ganha nota no menu', () => {
    expect(roomCloseNotice(4001)).toBe('O SERVIDOR FECHOU A SALA')
  })

  it.each([4000, 1000, undefined])('o resto fecha calado: %s', (code) => {
    expect(roomCloseNotice(code)).toBeNull()
  })
})
