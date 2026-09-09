import { readFileSync } from 'node:fs'
import { IDLE_INPUT, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { blockoutToStaticBoxes } from '../arena/collisionBoxes.ts'
import { GREYBOX_BLOCKOUT } from '../arena/greyboxBlockout.ts'
import { createLocalCharacter } from './localCharacter.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const boxes = blockoutToStaticBoxes(GREYBOX_BLOCKOUT)
const SPAWN_FEET = { x: 26, y: 0, z: 26 }
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

  it('o olho fica uma cápsula acima do pé, e entre os dois últimos ticks', () => {
    const character = createLocalCharacter(config, SPAWN_FEET, boxes)
    character.advance(0.5, FORWARD)
    character.advance(1 / 60 + 1 / 120, FORWARD)
    const eye = character.eyePosition({ x: 0, y: 0, z: 0 })
    expect(eye.y).toBeCloseTo(config.collision.capsuleHeightM)
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
