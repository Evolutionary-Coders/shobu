import { describe, expect, it } from 'vitest'
import {
  ballotsCastBy,
  botBallots,
  castBallot,
  decideMapVote,
  type MapBallot,
  mapVoteOptions,
  RANDOM_MAP_OPTION,
  tallyMapVote,
} from './mapVote.ts'

const MAPS = ['neon-kaido', 'ichiban-gai'] as const
const OPTIONS = mapVoteOptions(MAPS)
const WINDOW = { fromS: 1, untilS: 7 }
const BOTS = ['bot-0', 'bot-1', 'bot-2']

function vote(voterId: string, optionId: string, atS = 0): MapBallot {
  return { voterId, optionId, atS }
}

describe('mapVoteOptions', () => {
  it('os mapas na ordem do catálogo, e o aleatório por último', () => {
    expect(OPTIONS).toEqual(['neon-kaido', 'ichiban-gai', RANDOM_MAP_OPTION])
  })

  it('recusa catálogo vazio', () => {
    expect(() => mapVoteOptions([])).toThrow(/mapVoteOptions recebeu \[\]/)
  })
})

describe('botBallots', () => {
  it('um voto por bot, numa opção válida, dentro da janela, em ordem de chegada', () => {
    const ballots = botBallots(BOTS, OPTIONS, 42, WINDOW)
    expect(ballots.map((ballot) => ballot.voterId).sort()).toEqual(BOTS)
    for (const ballot of ballots) {
      expect(OPTIONS).toContain(ballot.optionId)
      expect(ballot.atS).toBeGreaterThanOrEqual(WINDOW.fromS)
      expect(ballot.atS).toBeLessThan(WINDOW.untilS)
    }
    const times = ballots.map((ballot) => ballot.atS)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('a mesma semente vota igual: é o que deixa o servidor concordar', () => {
    expect(botBallots(BOTS, OPTIONS, 7, WINDOW)).toEqual(botBallots(BOTS, OPTIONS, 7, WINDOW))
  })

  it('partidas diferentes votam diferente', () => {
    const outcomes = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        JSON.stringify(botBallots(BOTS, OPTIONS, seed, WINDOW).map((b) => b.optionId)),
      ),
    )
    expect(outcomes.size).toBeGreaterThan(3)
  })

  it('tirar um bot não muda o voto dos outros', () => {
    const three = botBallots(BOTS, OPTIONS, 9, WINDOW)
    const two = botBallots(BOTS.slice(0, 2), OPTIONS, 9, WINDOW)
    for (const ballot of two) expect(three).toContainEqual(ballot)
  })
})

describe('castBallot', () => {
  it('votar de novo troca o voto, e não soma', () => {
    const first = castBallot([], vote('local', 'neon-kaido', 1))
    const second = castBallot(first, vote('local', 'ichiban-gai', 2))
    expect(second).toEqual([vote('local', 'ichiban-gai', 2)])
    expect(first).toEqual([vote('local', 'neon-kaido', 1)])
  })
})

describe('ballotsCastBy', () => {
  it('só os votos que já chegaram', () => {
    const ballots = [vote('a', 'neon-kaido', 1), vote('b', 'neon-kaido', 5)]
    expect(ballotsCastBy(ballots, 3)).toEqual([ballots[0]])
  })
})

describe('tallyMapVote', () => {
  it('conta por opção, na ordem das opções', () => {
    const ballots = [
      vote('a', 'ichiban-gai'),
      vote('b', RANDOM_MAP_OPTION),
      vote('c', 'ichiban-gai'),
    ]
    expect(tallyMapVote(OPTIONS, ballots)).toEqual([0, 2, 1])
  })

  it('recusa voto em opção que não existe, dizendo quem votou e em quê', () => {
    expect(() => tallyMapVote(OPTIONS, [vote('bot-1', 'shibuya')])).toThrow(
      /bot-1 em 'shibuya'.*neon-kaido, ichiban-gai, random/,
    )
  })
})

describe('decideMapVote', () => {
  it('a maioria vence', () => {
    const ballots = [vote('a', 'ichiban-gai'), vote('b', 'ichiban-gai'), vote('c', 'neon-kaido')]
    expect(decideMapVote(OPTIONS, ballots, 1)).toEqual({
      optionId: 'ichiban-gai',
      mapId: 'ichiban-gai',
      tied: false,
    })
  })

  it('o empate é sorteado entre os empatados, e só entre eles', () => {
    const ballots = [vote('a', 'ichiban-gai'), vote('b', 'neon-kaido')]
    const winners = new Set(
      Array.from({ length: 40 }, (_, seed) => decideMapVote(OPTIONS, ballots, seed).optionId),
    )
    expect(winners).toEqual(new Set(['ichiban-gai', 'neon-kaido']))
    expect(decideMapVote(OPTIONS, ballots, 3).tied).toBe(true)
  })

  it('o sorteio do empate é da semente: a mesma partida decide igual', () => {
    const ballots = [vote('a', 'ichiban-gai'), vote('b', 'neon-kaido')]
    expect(decideMapVote(OPTIONS, ballots, 11)).toEqual(decideMapVote(OPTIONS, ballots, 11))
  })

  it('ninguém votou: todo mundo empatado em zero, e o sorteio decide', () => {
    expect(decideMapVote(OPTIONS, [], 5).tied).toBe(true)
  })

  it('o aleatório vencendo sorteia um dos mapas', () => {
    const ballots = [vote('a', RANDOM_MAP_OPTION)]
    const maps = new Set(
      Array.from({ length: 40 }, (_, seed) => decideMapVote(OPTIONS, ballots, seed).mapId),
    )
    expect(maps).toEqual(new Set(MAPS))
    expect(decideMapVote(OPTIONS, ballots, 2).optionId).toBe(RANDOM_MAP_OPTION)
  })

  it('recusa aleatório sem mapa para sortear', () => {
    expect(() => decideMapVote([RANDOM_MAP_OPTION], [], 1)).toThrow(/sem mapa nenhum/)
  })
})
