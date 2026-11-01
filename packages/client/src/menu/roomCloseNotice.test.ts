import { AFK_CLOSE_CODE } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { roomCloseNotice } from './roomCloseNotice.ts'

describe('roomCloseNotice', () => {
  it('a saída por inatividade ganha nota no menu', () => {
    expect(roomCloseNotice(AFK_CLOSE_CODE)).toBe('VOCÊ FOI REMOVIDO POR INATIVIDADE')
  })

  it.each([4000, 1006, undefined])('o resto fecha calado: %s', (code) => {
    expect(roomCloseNotice(code)).toBeNull()
  })
})
