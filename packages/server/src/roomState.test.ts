import { readFileSync } from 'node:fs'
import { ICHIBAN_GAI_LAYOUT, isBenched, NEON_KAIDO_LAYOUT, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeRoomStateSink } from './roomIoFake.ts'
import { createRoomSimulation, joinRoom, roomRulesFor } from './roomSimulation.ts'
import { writeRoomState } from './roomState.ts'

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
