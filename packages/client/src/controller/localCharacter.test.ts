import { readFileSync } from 'node:fs'
import {
  createCharacterState,
  EYE_HEIGHT_RATIO,
  IDLE_INPUT,
  parseGameplayConfig,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { blockoutToStaticBoxes } from '../arena/collisionBoxes.ts'
import { ICHIBAN_GAI_BLOCKOUT } from '../arena/ichibanGai.ts'
import { createLocalCharacter } from './localCharacter.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const boxes = blockoutToStaticBoxes(ICHIBAN_GAI_BLOCKOUT)
/** O pé do spawn 0 do Ichiban-gai, na rua norte, olhando para o cruzamento. */
const SPAWN_FEET = { x: -14, y: 0, z: 26 }
const FORWARD = { ...IDLE_INPUT, wishZ: -1 }

describe('createLocalCharacter', () => {
  it('converte tempo de quadro em ticks inteiros e guarda o resto', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    expect(character.advance(1 / 60 + 0.004, IDLE_INPUT)).toBe(1)
    expect(character.interpolationAlpha()).toBeCloseTo(0.004 * 60)
  })

  /** Quadro longo não vira espiral: o excedente é descartado, o jogo atrasa. */
  it('limita os ticks por quadro', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    expect(character.advance(1, IDLE_INPUT)).toBeLessThanOrEqual(6)
  })

  it('guarda o tick anterior para interpolar', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    character.advance(0.5, FORWARD)
    character.advance(1 / 60, FORWARD)
    expect(character.previous.position.z).toBeGreaterThan(character.current.position.z)
  })

  it('o olho fica a 92 % da cápsula acima do pé, e entre os dois últimos ticks', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    character.advance(0.5, FORWARD)
    character.advance(1 / 60 + 1 / 120, FORWARD)
    const eye = character.eyePosition({ x: 0, y: 0, z: 0 })
    expect(eye.y).toBeCloseTo(config.collision.capsuleHeightM * EYE_HEIGHT_RATIO)
    expect(eye.z).toBeLessThan(character.previous.position.z)
    expect(eye.z).toBeGreaterThan(character.current.position.z)
  })

  it('nasce no spawn e anda pela arena de verdade sem cair do mapa', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    for (let frame = 0; frame < 240; frame += 1) character.advance(1 / 60, FORWARD)
    expect(character.current.position.y).toBeGreaterThanOrEqual(0)
    expect(character.current.position.z).toBeLessThan(SPAWN_FEET.z)
  })
})

/**
 * `advance` é o atalho; `pendingTicks` + `stepOnce` é o caminho longo, que a
 * sessão da arena usa para intercalar a arma entre os ticks do corpo. Os dois
 * têm que chegar ao mesmo estado, senão a simulação depende de qual o
 * chamador escolheu.
 */
describe('pendingTicks e stepOnce', () => {
  it('o caminho longo chega ao mesmo estado que advance', () => {
    const byAdvance = createLocalCharacter(config, SPAWN_FEET, boxes)
    const byHand = createLocalCharacter(config, SPAWN_FEET, boxes)
    const input = { ...IDLE_INPUT, wishZ: 1 }
    for (let frame = 0; frame < 20; frame += 1) {
      byAdvance.advance(0.05, input)
      const ticks = byHand.pendingTicks(0.05)
      for (let tick = 0; tick < ticks; tick += 1) byHand.stepOnce(input)
    }
    expect(byHand.current).toEqual(byAdvance.current)
  })

  it('expõe a duração do tick que a arma tem que usar', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    expect(character.tickDurationS).toBeCloseTo(1 / config.simulation.tickHz)
  })
})

describe('respawnAt', () => {
  const RESPAWN_FEET = { x: 20.5, y: 0, z: -14 }

  it('põe o tick atual e o anterior no pé novo, parados', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    for (let frame = 0; frame < 30; frame += 1) character.advance(1 / 60, FORWARD)
    character.respawnAt(RESPAWN_FEET)
    for (const state of [character.current, character.previous]) {
      expect(state.position).toEqual(RESPAWN_FEET)
      expect(state.velocity).toEqual({ x: 0, y: 0, z: 0 })
    }
  })

  /** Mexer só no tick atual faria a câmera voar pelo mapa num quadro. */
  it('o olho interpolado já está no spawn novo no mesmo quadro', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    character.advance(1 / 60 + 1 / 120, FORWARD)
    character.respawnAt(RESPAWN_FEET)
    const eye = character.eyePosition({ x: 0, y: 0, z: 0 })
    expect(eye.x).toBeCloseTo(RESPAWN_FEET.x)
    expect(eye.z).toBeCloseTo(RESPAWN_FEET.z)
  })

  it('volta ao estado de nascimento, e não herda o slide', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    const slide = { ...FORWARD, sprint: true, crouch: true }
    for (let frame = 0; frame < 30; frame += 1) character.advance(1 / 60, FORWARD)
    character.advance(1 / 60, slide)
    character.advance(1 / 60, FORWARD)
    character.respawnAt(RESPAWN_FEET)
    expect(character.current).toEqual(createCharacterState(RESPAWN_FEET, config))
  })

  /** Revisão do núcleo: o pulo preso na morte saía sozinho no tick do respawn. */
  it('a tecla presa na morte não dispara no primeiro tick depois de nascer', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    const jumping = { ...FORWARD, jump: true }
    for (let frame = 0; frame < 30; frame += 1) character.advance(1 / 60, FORWARD)
    character.advance(1 / 60, jumping)
    character.respawnAt(RESPAWN_FEET)
    character.advance(1 / 60, jumping)
    expect(character.current.velocity.y).toBeLessThanOrEqual(0)
  })
})

describe('holdStill', () => {
  /** A câmera parada na posição da morte (GDD): nem anda, nem treme na interpolação. */
  it('para o corpo onde está, nos dois ticks, e o olho não se mexe mais', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    character.advance((1 / 60) * 20 + 1 / 120, FORWARD)
    character.holdStill()
    expect(character.current.velocity).toEqual({ x: 0, y: 0, z: 0 })
    expect(character.previous.position).toEqual(character.current.position)
    const eye = character.eyePosition({ x: 0, y: 0, z: 0 })
    expect(eye.z).toBeCloseTo(character.current.position.z)
  })

  it('a morte apaga o agachar alternado', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    character.advance(1 / 60 + 1 / 120, { ...FORWARD, crouch: true })
    expect(character.current.crouchToggled).toBe(true)
    character.holdStill()
    expect(character.current.crouchToggled).toBe(false)
  })
})
