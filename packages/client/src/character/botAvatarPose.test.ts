import { readFileSync } from 'node:fs'
import { createCharacterState, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  BOT_DEATH_CLIP,
  botClipFor,
  botMuzzleM,
  facingYawRad,
  interpolatedFeetM,
  poseOfBot,
} from './botAvatarPose.ts'
import { createClipSelection, createLocomotionPose } from './thirdPersonClips.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

function bodyMoving(vx: number, vz: number) {
  const body = createCharacterState({ x: 0, y: 0, z: 0 }, config)
  body.grounded = true
  body.velocity.x = vx
  body.velocity.z = vz
  return body
}

describe('interpolatedFeetM', () => {
  it('mistura o tick anterior e o atual pelo alfa', () => {
    const previous = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    const current = createCharacterState({ x: 2, y: 4, z: -6 }, config)
    expect(interpolatedFeetM(previous, current, 0.25, { x: 0, y: 0, z: 0 })).toEqual({
      x: 0.5,
      y: 1,
      z: -1.5,
    })
  })
})

describe('poseOfBot', () => {
  const NORTH = { x: 0, y: 0, z: 1 }

  it('andando para onde olha é frente, sem lado', () => {
    const pose = poseOfBot(bodyMoving(0, 5), NORTH, createLocomotionPose())
    expect([pose.ahead, pose.side, pose.grounded]).toEqual([1, 0, true])
    expect(pose.horizontalSpeedMps).toBeCloseTo(5)
  })

  it('andando de costas é trás: a corrida toca ao contrário', () => {
    expect(poseOfBot(bodyMoving(0, -5), NORTH, createLocomotionPose()).ahead).toBe(-1)
  })

  /** O passo lateral de quem troca tiro: a direita de quem olha para +z é +x. */
  it('o passo lateral é lado, e o sinal segue o do teclado', () => {
    expect(poseOfBot(bodyMoving(4, 0), NORTH, createLocomotionPose()).side).toBe(1)
    expect(poseOfBot(bodyMoving(-4, 0), NORTH, createLocomotionPose()).side).toBe(-1)
  })

  it('o tremor da frenagem não vira direção', () => {
    const pose = poseOfBot(bodyMoving(0.2, -0.3), NORTH, createLocomotionPose())
    expect([pose.ahead, pose.side]).toEqual([0, 0])
  })

  it('mirando reto para cima, a pose não vira NaN', () => {
    const pose = poseOfBot(bodyMoving(0, 5), { x: 0, y: 1, z: 0 }, createLocomotionPose())
    expect(Number.isNaN(pose.ahead)).toBe(false)
  })
})

describe('botClipFor', () => {
  function look(over: Partial<{ alive: boolean; paused: boolean }>) {
    const pose = poseOfBot(bodyMoving(0, 5), { x: 0, y: 0, z: 1 }, createLocomotionPose())
    return { alive: true, paused: false, pose, movement: config.movement, ...over }
  }

  it('vivo, o clipe da locomoção, escrito na seleção recebida', () => {
    const into = createClipSelection()
    expect(botClipFor(look({}), into)).toBe(into)
    expect(into.clip).toBe('Jog_Fwd_Loop')
    expect(into.speedRatio).toBeGreaterThan(0)
  })

  it('morto, o tombo, uma vez e sem laço', () => {
    expect(botClipFor(look({ alive: false }), createClipSelection())).toEqual(BOT_DEATH_CLIP)
  })

  /** No menu a arena para: o corpo congela, em vez de correr no lugar. */
  it('com a arena parada, o mesmo clipe com velocidade zero', () => {
    const selection = botClipFor(look({ paused: true }), createClipSelection())
    expect([selection.clip, selection.speedRatio]).toEqual(['Jog_Fwd_Loop', 0])
  })
})

describe('facingYawRad', () => {
  it('zero olhando para +z, e um quarto de volta para +x', () => {
    expect(facingYawRad({ x: 0, y: 0, z: 1 })).toBe(0)
    expect(facingYawRad({ x: 1, y: 0, z: 0 })).toBeCloseTo(Math.PI / 2)
  })
})

describe('botMuzzleM', () => {
  it('sai um palmo à frente do olho e um pouco abaixo', () => {
    const muzzle = botMuzzleM({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 })
    expect(muzzle.z).toBeGreaterThan(0.3)
    expect(muzzle.y).toBeLessThan(1.6)
    expect(muzzle.x).toBe(0)
  })
})
