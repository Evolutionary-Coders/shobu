import { describe, expect, it } from 'vitest'
import { copyCharacterState, createCharacterState } from '../movement/characterState.ts'
import { IDLE_INPUT } from '../movement/movementInput.ts'
import { FLOOR, FORWARD, shippedConfig, tickDurationS } from '../movement/movementTestKit.ts'
import { stepCharacter } from '../movement/stepCharacter.ts'
import { createMatch, joinMatch, leaveMatch, setPlayerInput, stepMatch } from './match.ts'

const config = shippedConfig()
const BOXES = [FLOOR]
const ORIGIN = { x: 0, y: 0, z: 0 }
const FAR = { x: 10, y: 0, z: 10 }

describe('joinMatch', () => {
  it('põe o jogador nos pés indicados, parado', () => {
    const match = createMatch()
    const player = joinMatch(match, 'ana', FAR, config)
    expect(player.character.position).toEqual(FAR)
    expect(player.input).toEqual(IDLE_INPUT)
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

describe('setPlayerInput', () => {
  it('recusa input de quem não está na partida, dizendo quem', () => {
    const match = createMatch()
    expect(() => setPlayerInput(match, 'bia', FORWARD)).toThrow(/'bia'/)
  })
})

describe('stepMatch', () => {
  it('avança o tick da partida', () => {
    const match = createMatch()
    stepMatch(match, BOXES, config)
    stepMatch(match, BOXES, config)
    expect(match.tick).toBe(2)
  })

  /**
   * O servidor e a predição do cliente têm que chegar no mesmo estado: cada
   * jogador avança exatamente como `stepCharacter` sozinho, com o próprio input.
   */
  it('avança cada jogador com o próprio input, igual ao stepCharacter', () => {
    const match = createMatch()
    joinMatch(match, 'ana', ORIGIN, config)
    joinMatch(match, 'bia', FAR, config)
    setPlayerInput(match, 'ana', FORWARD)
    const expectedAna = createCharacterState(ORIGIN, config)
    const expectedBia = createCharacterState(FAR, config)
    const dtS = tickDurationS(config)

    for (let tick = 0; tick < 10; tick += 1) {
      stepMatch(match, BOXES, config)
      stepCharacter(expectedAna, FORWARD, BOXES, config, dtS)
      stepCharacter(expectedBia, IDLE_INPUT, BOXES, config, dtS)
    }

    expect(match.players.get('ana')?.character).toEqual(expectedAna)
    expect(match.players.get('bia')?.character).toEqual(expectedBia)
  })

  it('mantém o último input até chegar outro', () => {
    const match = createMatch()
    const player = joinMatch(match, 'ana', ORIGIN, config)
    setPlayerInput(match, 'ana', FORWARD)
    stepMatch(match, BOXES, config)
    const afterOne = copyCharacterState(player.character, createCharacterState(ORIGIN, config))
    stepMatch(match, BOXES, config)
    expect(player.character.position.z).toBeGreaterThan(afterOne.position.z)
  })
})
