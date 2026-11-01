import { readFileSync } from 'node:fs'
import {
  BOT_BALLOT_WINDOW,
  ICHIBAN_GAI_LAYOUT,
  isBenched,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
  RANDOM_MAP_OPTION,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  createRoomSimulation,
  joinRoom,
  type RoomRules,
  type RoomSimulation,
  roomRulesFor,
} from './roomSimulation.ts'
import { castRoomVote, closeRoomVote, openRoomVote, visibleRoomBallots } from './roomVote.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const neon = roomRulesFor(NEON_KAIDO_LAYOUT, config)
const ichiban = roomRulesFor(ICHIBAN_GAI_LAYOUT, config)
const catalog = new Map<string, RoomRules>([
  [neon.arenaId, neon],
  [ichiban.arenaId, ichiban],
])

/** Ana na sala de Neon Kaido, na tela de resultado, com o voto aberto. */
function voting(): RoomSimulation {
  const room = createRoomSimulation(neon, catalog)
  joinRoom(room, 'ana', 'katana', neon)
  Object.assign(room.match.cycle, { phase: 'results', phaseS: 0 })
  room.match.vote = openRoomVote(room)
  return room
}

function seatedBotIds(room: RoomSimulation): string[] {
  return room.bots.squad.bots.filter((bot) => !isBenched(bot)).map((bot) => bot.id)
}

describe('openRoomVote', () => {
  it('oferece o catálogo, na ordem dele, e o ALEATÓRIO por último', () => {
    expect(voting().match.vote?.options).toEqual(['neon-kaido', 'ichiban-gai', RANDOM_MAP_OPTION])
  })

  /** O bot do banco não está na partida, e não vota nela. */
  it('agenda o voto de cada bot sentado, e só dele, dentro da janela', () => {
    const room = voting()
    const ballots = room.match.vote?.ballots ?? []
    expect(ballots.map((ballot) => ballot.voterId).sort()).toEqual(seatedBotIds(room).sort())
    for (const ballot of ballots) {
      expect(ballot.atS).toBeGreaterThanOrEqual(BOT_BALLOT_WINDOW.fromS)
      expect(ballot.atS).toBeLessThanOrEqual(BOT_BALLOT_WINDOW.untilS)
    }
  })

  it('muda a semente de uma partida para a outra', () => {
    const room = voting()
    const first = room.match.vote?.seed
    room.match.serial += 1
    expect(openRoomVote(room).seed).not.toBe(first)
  })
})

describe('castRoomVote', () => {
  it('guarda o voto de quem está sentado, no instante da tela', () => {
    const room = voting()
    room.match.cycle.phaseS = 2.5
    expect(castRoomVote(room, 'ana', 1)).toBe(true)
    expect(room.match.vote?.ballots).toContainEqual({
      voterId: 'ana',
      optionId: 'ichiban-gai',
      atS: 2.5,
    })
  })

  it('votar de novo troca o voto, não soma', () => {
    const room = voting()
    castRoomVote(room, 'ana', 0)
    castRoomVote(room, 'ana', 2)
    const mine = room.match.vote?.ballots.filter((ballot) => ballot.voterId === 'ana')
    expect(mine?.map((ballot) => ballot.optionId)).toEqual([RANDOM_MAP_OPTION])
  })

  it.each([
    ['índice fora das opções', 'ana', 3],
    ['índice negativo', 'ana', -1],
    ['índice que não é inteiro', 'ana', 0.5],
    ['índice que não é número', 'ana', '1'],
    ['quem não está sentado', 'zé', 0],
  ])('recusa %s', (_, playerId, raw) => {
    const room = voting()
    const before = room.match.vote?.ballots
    expect(castRoomVote(room, playerId, raw)).toBe(false)
    expect(room.match.vote?.ballots).toBe(before)
  })

  it('recusa fora da tela de resultado e sem voto aberto', () => {
    const room = voting()
    room.match.cycle.phase = 'decided'
    expect(castRoomVote(room, 'ana', 0)).toBe(false)
    room.match.cycle.phase = 'results'
    closeRoomVote(room)
    expect(castRoomVote(room, 'ana', 0)).toBe(false)
    room.match.vote = undefined
    expect(castRoomVote(room, 'ana', 0)).toBe(false)
  })
})

describe('closeRoomVote', () => {
  it('decide pela maioria, e guarda o mapa e o índice da opção que venceu', () => {
    const room = voting()
    const vote = room.match.vote
    if (!vote) throw new Error('voto não abriu')
    vote.ballots = [
      { voterId: 'ana', optionId: 'ichiban-gai', atS: 1 },
      { voterId: 'bot-0', optionId: 'ichiban-gai', atS: 2 },
      { voterId: 'bot-1', optionId: 'neon-kaido', atS: 3 },
    ]
    expect(closeRoomVote(room)).toMatchObject({ mapId: 'ichiban-gai', winner: 1, tied: false })
    expect(vote.outcome?.winner).toBe(1)
  })

  /** A tela mais curta que a janela dos bots: o voto que ninguém viu não decide. */
  it('conta só o que chegou até o fim da tela de resultado', () => {
    const room = voting()
    const vote = room.match.vote
    if (!vote) throw new Error('voto não abriu')
    vote.ballots = [
      { voterId: 'ana', optionId: 'ichiban-gai', atS: 1 },
      { voterId: 'bot-0', optionId: 'neon-kaido', atS: config.match.resultsS + 1 },
      { voterId: 'bot-1', optionId: 'neon-kaido', atS: config.match.resultsS + 2 },
    ]
    expect(closeRoomVote(room)?.mapId).toBe('ichiban-gai')
  })

  it('sem voto aberto, não decide nada', () => {
    const room = voting()
    room.match.vote = undefined
    expect(closeRoomVote(room)).toBeUndefined()
  })
})

describe('visibleRoomBallots', () => {
  it('na tela de resultado, mostra os votos que já chegaram', () => {
    const room = voting()
    room.match.cycle.phaseS = 0
    expect(visibleRoomBallots(room)).toEqual([])
    room.match.cycle.phaseS = BOT_BALLOT_WINDOW.untilS
    expect(visibleRoomBallots(room)).toHaveLength(seatedBotIds(room).length)
  })

  it('depois da tela, mostra os que contaram; sem voto, nenhum', () => {
    const room = voting()
    room.match.cycle.phase = 'decided'
    room.match.cycle.phaseS = 0
    expect(visibleRoomBallots(room)).toHaveLength(seatedBotIds(room).length)
    room.match.vote = undefined
    expect(visibleRoomBallots(room)).toEqual([])
  })
})
