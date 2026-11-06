import { readFileSync } from 'node:fs'
import {
  encodeHumanSkin,
  ICHIBAN_GAI_LAYOUT,
  isBenched,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
  serverBotAccentOf,
  serverBotSkinOf,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeRoomStateSink } from './roomIoFake.ts'
import { chooseCosmetics } from './roomSeatChoices.ts'
import { createRoomSimulation, joinRoom, leaveRoom, roomRulesFor } from './roomSimulation.ts'
import { writeRoomState } from './roomState.ts'
import { closeRoomVote, openRoomVote } from './roomVote.ts'

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const rules = roomRulesFor(NEON_KAIDO_LAYOUT, config)

function roomWithAna() {
  const room = createRoomSimulation(rules)
  joinRoom(room, 'ana', 'katana', rules)
  return room
}

describe('writeRoomState, o placar oficial', () => {
  /** O tab de cada cliente mostra o placar do servidor, e quem entra no meio o lê aqui. */
  it('escreve pontos, abates, mortes e os pontos da vida de cada humano', () => {
    const room = roomWithAna()
    Object.assign(room.board.players.get('ana') ?? {}, {
      points: 1250,
      kills: 9,
      deaths: 4,
      scorestreakPoints: 300,
    })
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(sink.states.get('ana')).toMatchObject({
      points: 1250,
      kills: 9,
      deaths: 4,
      streakPoints: 300,
    })
  })

  /** O ping é o que o cliente relatou (`notePing`); o bot roda no servidor e fica em zero. */
  it('escreve o ping relatado de cada humano, e zero no bot', () => {
    const room = roomWithAna()
    const seat = room.seats.get('ana')
    if (seat) seat.pingMs = 87
    const bot = room.bots.squad.bots.find((candidate) => !isBenched(candidate))
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(sink.states.get('ana')?.pingMs).toBe(87)
    expect(sink.states.get(bot?.id ?? '')?.pingMs).toBe(0)
  })

  it('escreve a linha de cada bot sentado', () => {
    const room = roomWithAna()
    const bot = room.bots.squad.bots.find((candidate) => !isBenched(candidate))
    const botId = bot?.id ?? ''
    Object.assign(room.board.players.get(botId) ?? {}, { points: 700, kills: 7 })
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(sink.states.get(botId)).toMatchObject({ points: 700, kills: 7 })
  })

  /** O `uint16` daria a volta: 65 536 pontos da vida virariam zero no hud. */
  it('segura no teto do uint16 o que passa dele', () => {
    const room = roomWithAna()
    Object.assign(room.board.players.get('ana') ?? {}, { scorestreakPoints: 70_000 })
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(sink.states.get('ana')?.streakPoints).toBe(65_535)
  })

  it('sem linha no placar, deixa o que estava', () => {
    const room = roomWithAna()
    room.board.players.delete('ana')
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(sink.states.get('ana')?.points).toBe(0)
  })
})

describe('createRoomSimulation, o catálogo', () => {
  it('sem catálogo, a sala só conhece o próprio mapa', () => {
    const room = createRoomSimulation(rules)
    expect([...room.arenas.keys()]).toEqual([NEON_KAIDO_LAYOUT.id])
    expect(room.rules).toBe(rules)
  })

  it('recusa um mapa fora do catálogo, dizendo qual e qual o catálogo', () => {
    const other = roomRulesFor(ICHIBAN_GAI_LAYOUT, config)
    expect(() => createRoomSimulation(rules, new Map([[other.arenaId, other]]))).toThrow(
      /'neon-kaido' fora do catálogo \[ichiban-gai\]/,
    )
  })
})

/** O mapa de votos que conta quantas vezes foi escrito. */
class CountingBallots extends Map<string, number> {
  writes = 0

  override set(voterId: string, optionIndex: number): this {
    this.writes += 1
    return super.set(voterId, optionIndex)
  }
}

describe('writeRoomState, o voto', () => {
  function voting() {
    const room = roomWithAna()
    Object.assign(room.match.cycle, { phase: 'results', phaseS: 0 })
    const vote = openRoomVote(room)
    vote.ballots = [
      { voterId: 'ana', optionId: 'random', atS: 1 },
      { voterId: 'bot-0', optionId: 'neon-kaido', atS: 4 },
    ]
    room.match.vote = vote
    return room
  }

  it('escreve os votos que já chegaram, como índice da opção', () => {
    const room = voting()
    room.match.cycle.phaseS = 2
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect([...sink.match.ballots]).toEqual([['ana', 1]])
    expect(sink.match).toMatchObject({ winner: -1, nextArenaId: '' })
  })

  /** O schema manda o que mudou: o voto trocado reescreve só a entrada dele. */
  it('reescreve o voto que mudou de opção, e só ele', () => {
    const room = voting()
    room.match.cycle.phaseS = 5
    const ballots = new CountingBallots()
    const fake = new FakeRoomStateSink()
    const sink = { ...fake, matchState: () => ({ ...fake.match, ballots }) }
    writeRoomState(room, sink)
    const vote = room.match.vote
    const [, botBallot] = vote?.ballots ?? []
    if (vote && botBallot) {
      vote.ballots = [{ voterId: 'ana', optionId: 'neon-kaido', atS: 4.5 }, botBallot]
    }
    ballots.writes = 0
    writeRoomState(room, sink)
    expect(ballots.writes).toBe(1)
    expect(ballots.get('ana')).toBe(0)
  })

  /** O voto segue a sala: quem saiu não fica na tela com o voto dele. */
  it('tira do estado o voto de quem saiu da sala', () => {
    const room = voting()
    room.match.cycle.phaseS = 5
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    leaveRoom(room, 'ana', rules)
    writeRoomState(room, sink)
    expect([...sink.match.ballots.keys()]).toEqual(['bot-0'])
  })

  it('com o voto fechado, escreve o que venceu e o mapa seguinte', () => {
    const room = voting()
    room.match.cycle.phase = 'decided'
    closeRoomVote(room)
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(sink.match.winner).toBe(room.match.vote?.outcome?.winner)
    expect(sink.match.nextArenaId).toBe(room.match.vote?.outcome?.mapId)
  })

  it('sem voto, esvazia os votos da partida anterior', () => {
    const room = voting()
    room.match.cycle.phaseS = 5
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    room.match.vote = undefined
    writeRoomState(room, sink)
    expect(sink.match.ballots.size).toBe(0)
    writeRoomState(room, sink)
    expect(sink.match.ballots.size).toBe(0)
  })
})

describe('writeRoomState, o visual', () => {
  /** Regressão do playtest: cada cliente vestia os outros com a própria conta local. */
  it('escreve a skin, o acabamento e o acento que a sala guarda no assento', () => {
    const room = roomWithAna()
    chooseCosmetics(room, 'ana', 'vex', 'carbono')
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    expect(sink.states.get('ana')).toMatchObject({
      skin: encodeHumanSkin('vex'),
      finish: 'carbono',
      accent: room.seats.get('ana')?.accent,
    })
  })

  it('veste cada bot sentado pelo índice dele no esquadrão, com o acabamento padrão', () => {
    const room = roomWithAna()
    const sink = new FakeRoomStateSink()
    writeRoomState(room, sink)
    room.bots.squad.bots.forEach((bot, index) => {
      if (isBenched(bot)) return
      expect(sink.states.get(bot.id)).toMatchObject({
        skin: encodeHumanSkin(serverBotSkinOf(index)),
        finish: '',
        accent: serverBotAccentOf(index),
      })
    })
  })
})
