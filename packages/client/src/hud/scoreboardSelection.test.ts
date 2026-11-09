import { describe, expect, it } from 'vitest'
import type { ScoreboardRow } from './scoreboardRows.ts'
import {
  isKickableRow,
  keptKickSelection,
  pickKickRow,
  roomIdLookup,
  stepKickSelection,
  watchScoreboardRows,
} from './scoreboardSelection.ts'

const ROWS: readonly Pick<ScoreboardRow, 'roomId' | 'local'>[] = [
  { roomId: 'r1', local: false },
  { roomId: 'bot-0', local: false },
  { roomId: 'eu', local: true },
  { roomId: 'k1', local: false },
  { local: false },
]

describe('isKickableRow', () => {
  it('só outro humano da sala', () => {
    expect(ROWS.map(isKickableRow)).toEqual([true, false, false, true, false])
  })
})

describe('stepKickSelection', () => {
  it('sem escolha, para baixo vai à primeira e para cima à última', () => {
    expect(stepKickSelection(ROWS, undefined, 1)).toBe('r1')
    expect(stepKickSelection(ROWS, undefined, -1)).toBe('k1')
  })

  it('anda só pelas votáveis, dando a volta', () => {
    expect(stepKickSelection(ROWS, 'r1', 1)).toBe('k1')
    expect(stepKickSelection(ROWS, 'k1', 1)).toBe('r1')
    expect(stepKickSelection(ROWS, 'r1', -1)).toBe('k1')
  })

  it('sem ninguém para votar, nada', () => {
    expect(stepKickSelection([{ roomId: 'eu', local: true }], undefined, 1)).toBeUndefined()
  })
})

describe('keptKickSelection e pickKickRow', () => {
  it('a escolha fica enquanto a linha dá para votar', () => {
    expect(keptKickSelection(ROWS, 'k1')).toBe('k1')
    expect(keptKickSelection(ROWS, 'bot-0')).toBeUndefined()
    expect(keptKickSelection(ROWS, 'saiu')).toBeUndefined()
  })

  it('sem giro, mantém; com giro, anda', () => {
    expect(pickKickRow(ROWS, 'k1', 0)).toBe('k1')
    expect(pickKickRow(ROWS, 'k1', 1)).toBe('r1')
  })
})

describe('roomIdLookup', () => {
  it('leva cada lutador ao id da sala', () => {
    const session = {
      forEachRoomPlayer: (visit: (playerId: string, fighter: { readonly id: string }) => void) => {
        visit('r1', { id: 'bot-1' })
      },
    }
    const roomIdOf = roomIdLookup(session)
    expect(roomIdOf('bot-1')).toBe('r1')
    expect(roomIdOf('local')).toBeUndefined()
  })
})

describe('watchScoreboardRows', () => {
  it('guarda as últimas linhas e as repassa ao hud', () => {
    const written: (readonly ScoreboardRow[])[] = []
    const watched = watchScoreboardRows({ setScoreboard: (rows) => written.push(rows) })
    expect(watched.rows()).toEqual([])
    const rows: ScoreboardRow[] = [
      { rank: 1, name: 'RAIDEN', points: 0, kills: 0, deaths: 0, ping: '--', local: false },
    ]
    watched.hud.setScoreboard(rows)
    expect(watched.rows()).toBe(rows)
    expect(written).toEqual([rows])
  })
})
