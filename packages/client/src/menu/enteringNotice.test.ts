import { describe, expect, it } from 'vitest'
import { ENTERING_NOTICE, noticeWhileEntering } from './enteringNotice.ts'

function noticeBoard(): { shown: (string | null)[]; set: (notice: string | null) => void } {
  const shown: (string | null)[] = []
  return { shown, set: (notice) => shown.push(notice) }
}

describe('noticeWhileEntering', () => {
  /** Regressão: a entrada recusada (o pointer lock negado, o Esc no meio) deixava o CONECTANDO… na tela. */
  it('apaga o aviso quando a entrada falha ou é cancelada', async () => {
    const board = noticeBoard()
    await noticeWhileEntering(board.set, Promise.resolve(false))
    expect(board.shown).toEqual([ENTERING_NOTICE, null])
  })

  it('com a entrada feita, deixa o aviso para o controle apagar', async () => {
    const board = noticeBoard()
    await noticeWhileEntering(board.set, Promise.resolve(true))
    expect(board.shown).toEqual([ENTERING_NOTICE])
  })

  it('na recarga da página, o aviso fica até ela sair', async () => {
    const board = noticeBoard()
    await noticeWhileEntering(board.set, undefined)
    expect(board.shown).toEqual([ENTERING_NOTICE])
  })
})
