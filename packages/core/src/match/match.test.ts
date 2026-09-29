import { describe, expect, it } from 'vitest'
import { createCharacterState } from '../movement/characterState.ts'
import { IDLE_INPUT } from '../movement/movementInput.ts'
import { FLOOR, FORWARD, shippedConfig, tickDurationS } from '../movement/movementTestKit.ts'
import { stepCharacter } from '../movement/stepCharacter.ts'
import { createMatch, joinMatch, leaveMatch, stepMatchPlayer } from './match.ts'

const config = shippedConfig()
const BOXES = [FLOOR]
const ORIGIN = { x: 0, y: 0, z: 0 }
const FAR = { x: 10, y: 0, z: 10 }

describe('joinMatch', () => {
  it('põe o jogador nos pés indicados', () => {
    const match = createMatch()
    const player = joinMatch(match, 'ana', FAR, config)
    expect(player.character.position).toEqual(FAR)
    expect(match.players.get('ana')).toBe(player)
  })

  it('recusa o mesmo jogador duas vezes, dizendo quem', () => {
    const match = createMatch()
    joinMatch(match, 'ana', ORIGIN, config)
    expect(() => joinMatch(match, 'ana', FAR, config)).toThrow(/'ana'/)
  })
})

describe('leaveMatch', () => {
  it('tira o jogador da partida', () => {
    const match = createMatch()
    joinMatch(match, 'ana', ORIGIN, config)
    leaveMatch(match, 'ana')
    expect(match.players.has('ana')).toBe(false)
  })

  /** A queda da conexão e a saída pela aba podem chegar as duas; a segunda não é erro. */
  it('ignora quem já saiu', () => {
    const match = createMatch()
    expect(() => leaveMatch(match, 'ninguém')).not.toThrow()
  })
})

describe('stepMatchPlayer', () => {
  /**
   * A predição do cliente só reconcilia sem erro se N inputs aplicados dão o
   * mesmo estado nos dois lados: um input é um tick, igual ao `stepCharacter`.
   */
  it('avança só o jogador do input, igual ao stepCharacter', () => {
    const match = createMatch()
    joinMatch(match, 'ana', ORIGIN, config)
    const bia = joinMatch(match, 'bia', FAR, config)
    const expectedAna = createCharacterState(ORIGIN, config)
    const dtS = tickDurationS(config)

    for (let tick = 0; tick < 10; tick += 1) {
      stepMatchPlayer(match, 'ana', FORWARD, BOXES, config)
      stepCharacter(expectedAna, FORWARD, BOXES, config, dtS)
    }

    expect(match.players.get('ana')?.character).toEqual(expectedAna)
    expect(bia.character).toEqual(createCharacterState(FAR, config))
  })

  it('recusa input de quem não está na partida, dizendo quem', () => {
    const match = createMatch()
    expect(() => stepMatchPlayer(match, 'bia', IDLE_INPUT, BOXES, config)).toThrow(/'bia'/)
  })
})
