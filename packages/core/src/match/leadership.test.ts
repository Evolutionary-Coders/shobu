import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { MatchConfig } from '../config/gameplayConfig.ts'
import { parseGameplayConfig } from '../config/parseGameplayConfig.ts'
import { addPlayer, createScoreboard, type Scoreboard } from '../scoring/scoreboard.ts'
import {
  createLeadershipWatch,
  LEAD_CALLOUT_COOLDOWN_S,
  type LeadershipWatch,
  leadershipCalloutSince,
  resetLeadershipWatch,
} from './leadership.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

/** Limite de 1000, kill de 100: números lidos de cabeça. */
const match: MatchConfig = { ...shipped.match, pointsPerKill: 100, scoreLimitPoints: 1000 }

function boardWith(points: Readonly<Record<string, number>>): Scoreboard {
  const board = createScoreboard()
  for (const [id, value] of Object.entries(points)) addPlayer(board, id).points = value
  return board
}

function setPoints(board: Scoreboard, id: string, points: number): void {
  addPlayer(board, id).points = points
}

function read(watch: LeadershipWatch, board: Scoreboard, limits: MatchConfig = match, nowS = 0) {
  return leadershipCalloutSince(watch, board, 'local', limits, nowS)
}

/** Lê depois do intervalo entre falas: os casos que não são do intervalo. */
function readLater(watch: LeadershipWatch, board: Scoreboard) {
  return read(watch, board, match, LEAD_CALLOUT_COOLDOWN_S)
}

describe('leadershipCalloutSince', () => {
  it('ninguém pontuou: nada a dizer', () => {
    expect(read(createLeadershipWatch(), boardWith({ local: 0, 'bot-0': 0 }))).toBeUndefined()
  })

  it('assumir a ponta sozinho avisa uma vez', () => {
    const watch = createLeadershipWatch()
    const board = boardWith({ local: 0, 'bot-0': 0 })
    setPoints(board, 'local', 100)
    expect(read(watch, board)).toBe('lead-taken')
    expect(read(watch, board)).toBeUndefined()
  })

  /** Trocar kills com o vice fazia "perdeu, assumiu" a cada kill. */
  it('empatar não tira a ponta de quem liderava, e só ser passado tira', () => {
    const watch = createLeadershipWatch()
    const board = boardWith({ local: 200, 'bot-0': 100 })
    read(watch, board)
    setPoints(board, 'bot-0', 200)
    expect(readLater(watch, board)).toBeUndefined()
    setPoints(board, 'local', 300)
    expect(readLater(watch, board)).toBeUndefined()
    setPoints(board, 'bot-0', 400)
    expect(readLater(watch, board)).toBe('lead-lost')
  })

  it('empatar com quem lidera não dá a ponta; passar dá', () => {
    const watch = createLeadershipWatch()
    const board = boardWith({ local: 100, 'bot-0': 200 })
    read(watch, board)
    setPoints(board, 'local', 200)
    expect(readLater(watch, board)).toBeUndefined()
    setPoints(board, 'local', 300)
    expect(readLater(watch, board)).toBe('lead-taken')
  })

  it('a troca de ponta dentro do intervalo é anotada, calada', () => {
    const watch = createLeadershipWatch()
    const board = boardWith({ local: 100, 'bot-0': 0 })
    expect(read(watch, board, match, 10)).toBe('lead-taken')
    setPoints(board, 'bot-0', 200)
    expect(read(watch, board, match, 12)).toBeUndefined()
    expect(watch.leading).toBe(false)
    setPoints(board, 'local', 300)
    expect(read(watch, board, match, 10 + LEAD_CALLOUT_COOLDOWN_S)).toBe('lead-taken')
  })

  it('empatado na ponta não é liderar: nada a dizer', () => {
    expect(read(createLeadershipWatch(), boardWith({ local: 100, 'bot-0': 100 }))).toBeUndefined()
  })

  it('jogador fora do placar: nunca lidera', () => {
    expect(read(createLeadershipWatch(), boardWith({ 'bot-0': 100 }))).toBeUndefined()
  })

  it('a uma kill do limite avisa uma vez só na partida', () => {
    const watch = createLeadershipWatch()
    const board = boardWith({ local: 800, 'bot-0': 900 })
    expect(read(watch, board)).toBeUndefined()
    setPoints(board, 'local', 900)
    setPoints(board, 'bot-0', 950)
    expect(read(watch, board)).toBe('one-kill-left')
    setPoints(board, 'local', 920)
    expect(read(watch, board)).toBeUndefined()
  })

  it('a kill que chega ao limite não avisa: a partida já acabou', () => {
    const board = boardWith({ local: 1000 })
    expect(read(createLeadershipWatch(), board)).toBe('lead-taken')
  })

  it('a uma kill e assumindo a ponta: a de uma kill fala, a ponta fica anotada', () => {
    const watch = createLeadershipWatch()
    const board = boardWith({ local: 900, 'bot-0': 100 })
    expect(read(watch, board)).toBe('one-kill-left')
    expect(read(watch, board)).toBeUndefined()
    expect(watch.leading).toBe(true)
  })

  it('sem limite de pontos não há aviso de uma kill', () => {
    const board = boardWith({ local: 900, 'bot-0': 900 })
    expect(read(createLeadershipWatch(), board, { ...match, scoreLimitPoints: 0 })).toBeUndefined()
  })

  it('o placar zerado na partida nova zera a vigia sem anunciar a ponta perdida', () => {
    const watch = createLeadershipWatch()
    const board = boardWith({ local: 900, 'bot-0': 100 })
    read(watch, board)
    setPoints(board, 'local', 0)
    setPoints(board, 'bot-0', 0)
    expect(read(watch, board)).toBeUndefined()
    setPoints(board, 'local', 900)
    expect(read(watch, board)).toBe('one-kill-left')
  })

  it('resetLeadershipWatch volta tudo ao começo', () => {
    const watch = createLeadershipWatch()
    read(watch, boardWith({ local: 900 }))
    resetLeadershipWatch(watch)
    expect(watch).toEqual(createLeadershipWatch())
  })
})
