import { AFK_CLOSE_CODE, KICK_CLOSE_CODE } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { type RoomCloseScreen, roomCloseNotice, showRoomClose } from './roomCloseNotice.ts'

describe('roomCloseNotice', () => {
  it('a saída por inatividade ganha nota no menu', () => {
    expect(roomCloseNotice(AFK_CLOSE_CODE)).toBe('VOCÊ FOI REMOVIDO POR INATIVIDADE')
  })

  /** Regressão: a queda pelo heartbeat era calada, e o jogo seguia sozinho com o placar parado. */
  it('a expulsão por voto ganha nota no menu', () => {
    expect(roomCloseNotice(KICK_CLOSE_CODE)).toBe('VOCÊ FOI EXPULSO DA SALA POR VOTO')
  })

  it('a queda da conexão ganha nota no menu', () => {
    expect(roomCloseNotice(1006)).toBe('A CONEXÃO COM O SERVIDOR CAIU')
  })

  /**
   * Regressão: o código da inatividade era 4002, o `WITH_ERROR` do colyseus, e
   * o fechamento por erro dele dizia ao jogador que ele estava inativo.
   */
  it('o fechamento por erro do colyseus é queda, e não inatividade', () => {
    expect(roomCloseNotice(4002)).toBe('A CONEXÃO COM O SERVIDOR CAIU')
  })

  it('o servidor desligando ganha nota no menu', () => {
    expect(roomCloseNotice(4001)).toBe('O SERVIDOR FECHOU A SALA')
  })

  it.each([4000, 1000, undefined])('o resto fecha calado: %s', (code) => {
    expect(roomCloseNotice(code)).toBeNull()
  })
})

/** A tela, sem dom: guarda as notas e quantas vezes tirou o jogador da arena. */
class FakeRoomCloseScreen implements RoomCloseScreen {
  readonly notices: (string | null)[] = []
  left = 0

  setNotice(notice: string | null): void {
    this.notices.push(notice)
  }

  leaveArena(): void {
    this.left += 1
  }
}

describe('showRoomClose', () => {
  /**
   * Regressão: a nota ia para o menu escondido, e o removido por inatividade
   * seguia na arena contra os bots locais, sem saber por quê.
   */
  it.each([AFK_CLOSE_CODE, KICK_CLOSE_CODE, 1006, 4001])(
    'com nota, tira o jogador da arena: %s',
    (code) => {
      const screen = new FakeRoomCloseScreen()
      showRoomClose(screen, code)
      expect(screen.notices).toEqual([roomCloseNotice(code)])
      expect(screen.left).toBe(1)
    },
  )

  it('a saída pedida fecha calada e deixa o jogador na arena', () => {
    const screen = new FakeRoomCloseScreen()
    showRoomClose(screen, undefined)
    expect(screen.notices).toEqual([null])
    expect(screen.left).toBe(0)
  })
})
