import { readFileSync } from 'node:fs'
import { createCharacterState, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createHeldKeys } from '../controller/heldKeys.ts'
import {
  createLocomotionPose,
  type LocomotionPose,
  poseOfLocalCharacter,
  thirdPersonClipFor,
} from './thirdPersonClips.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const { movement } = config

const standing = (over: Partial<LocomotionPose>): LocomotionPose => ({
  stance: 'standing',
  grounded: true,
  horizontalSpeedMps: 0,
  ahead: 0,
  side: 0,
  ...over,
})

describe('thirdPersonClipFor', () => {
  it('parado é idle com a arma', () => {
    expect(thirdPersonClipFor(standing({}), movement).clip).toBe('CharacterArmature|Idle_Gun')
  })

  /** O ruído da frenagem não pode piscar o walk: abaixo de 0,3 m/s é parado. */
  it('quase parado ainda é idle', () => {
    const pose = standing({ horizontalSpeedMps: 0.2, ahead: 1 })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('CharacterArmature|Idle_Gun')
  })

  it('correndo para a frente toca o run na velocidade da corrida', () => {
    const pose = standing({ horizontalSpeedMps: movement.runSpeedMps, ahead: 1 })
    expect(thirdPersonClipFor(pose, movement)).toEqual({
      clip: 'CharacterArmature|Run',
      loop: true,
      speedRatio: 1,
    })
  })

  /** Corrida tática é o mesmo clipe mais rápido: os pés acompanham o chão. */
  it('corrida tática acelera o run', () => {
    const pose = standing({ horizontalSpeedMps: movement.sprintSpeedMps, ahead: 1 })
    expect(thirdPersonClipFor(pose, movement).speedRatio).toBeCloseTo(
      movement.sprintSpeedMps / movement.runSpeedMps,
    )
  })

  it.each([
    [-1, 0, 'CharacterArmature|Run_Back'],
    [0, 1, 'CharacterArmature|Run_Right'],
    [0, -1, 'CharacterArmature|Run_Left'],
    [1, 1, 'CharacterArmature|Run'],
    [-1, 1, 'CharacterArmature|Run_Back'],
  ] as const)('frente %i, lado %i toca %s', (ahead, side, clip) => {
    const pose = standing({ horizontalSpeedMps: 9, ahead, side })
    expect(thirdPersonClipFor(pose, movement).clip).toBe(clip)
  })

  it('slide é o roll', () => {
    const pose = standing({ stance: 'sliding', horizontalSpeedMps: 13, ahead: 1 })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('CharacterArmature|Roll')
  })

  /** O asset não tem pulo: no ar o corpo fica na pose de mira, que lê como travado. */
  it('no ar fica na pose de mira, seja qual for a velocidade', () => {
    const pose = standing({ grounded: false, horizontalSpeedMps: 12, ahead: 1 })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('CharacterArmature|Idle_Gun_Pointing')
  })

  it('agachado andando usa o walk na velocidade de agachado', () => {
    const pose = standing({
      stance: 'crouching',
      horizontalSpeedMps: movement.crouchSpeedMps,
      ahead: 1,
    })
    expect(thirdPersonClipFor(pose, movement)).toEqual({
      clip: 'CharacterArmature|Walk',
      loop: true,
      speedRatio: 1,
    })
  })

  it('agachado parado é idle', () => {
    const pose = standing({ stance: 'crouching' })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('CharacterArmature|Idle_Gun')
  })
})

describe('poseOfLocalCharacter', () => {
  it('lê postura, chão e velocidade do estado, e a direção das teclas', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    state.grounded = true
    state.velocity.x = 3
    state.velocity.z = 4
    const keys = { ...createHeldKeys(), back: true, left: true }
    const pose = poseOfLocalCharacter(state, keys, createLocomotionPose())
    expect(pose).toEqual({
      stance: 'standing',
      grounded: true,
      horizontalSpeedMps: 5,
      ahead: -1,
      side: -1,
    })
  })

  /** O par oposto do caso acima: sem ele, o sinal positivo do eixo nunca roda. */
  it('frente e direita presas dão o eixo positivo nos dois', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    const keys = { ...createHeldKeys(), forward: true, right: true }
    const pose = poseOfLocalCharacter(state, keys, createLocomotionPose())
    expect(pose.ahead).toBe(1)
    expect(pose.side).toBe(1)
  })

  it('teclas opostas presas não são direção', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    const keys = { ...createHeldKeys(), forward: true, back: true }
    expect(poseOfLocalCharacter(state, keys, createLocomotionPose()).ahead).toBe(0)
  })

  it('escreve no objeto recebido em vez de alocar', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    const into = createLocomotionPose()
    expect(poseOfLocalCharacter(state, createHeldKeys(), into)).toBe(into)
  })
})
