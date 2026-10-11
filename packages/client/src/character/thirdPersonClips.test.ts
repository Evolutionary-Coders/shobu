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
    expect(thirdPersonClipFor(standing({}), movement).clip).toBe('Pistol_Idle_Loop')
  })

  /** O ruído da frenagem não pode piscar o clipe de andar: abaixo de 0,3 m/s é parado. */
  it('quase parado ainda é idle', () => {
    const pose = standing({ horizontalSpeedMps: 0.2, ahead: 1 })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('Pistol_Idle_Loop')
  })

  it('correndo para a frente toca o jog na velocidade da corrida', () => {
    const pose = standing({ horizontalSpeedMps: movement.runSpeedMps, ahead: 1 })
    expect(thirdPersonClipFor(pose, movement)).toEqual({
      clip: 'Jog_Fwd_Loop',
      loop: true,
      speedRatio: 1,
    })
  })

  /** Acelerar o jog até a corrida tática o deixava patinando: acima do limiar vira sprint. */
  it('a corrida tática troca o jog pelo sprint', () => {
    const pose = standing({ horizontalSpeedMps: movement.sprintSpeedMps, ahead: 1 })
    const selection = thirdPersonClipFor(pose, movement)
    expect(selection.clip).toBe('Sprint_Loop')
    expect(selection.speedRatio).toBeCloseTo(1, 2)
  })

  /**
   * A UAL não tem strafe. Ir para trás toca a corrida ao contrário, que lê bem
   * porque os pés continuam batendo na direção do movimento.
   */
  it('andar para trás toca a corrida ao contrário', () => {
    const pose = standing({ horizontalSpeedMps: movement.runSpeedMps, ahead: -1 })
    const selection = thirdPersonClipFor(pose, movement)
    expect(selection.clip).toBe('Jog_Fwd_Loop')
    expect(selection.speedRatio).toBeLessThan(0)
  })

  it('strafe puro toca a corrida para a frente', () => {
    const pose = standing({ horizontalSpeedMps: movement.runSpeedMps, ahead: 0, side: 1 })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('Jog_Fwd_Loop')
  })

  /** O que a troca do SWAT pelo Mannequin veio resolver: no ar havia pose de mira. */
  it('no ar o corpo cai, em vez de ficar na pose de mira', () => {
    const pose = standing({ grounded: false, horizontalSpeedMps: 4, ahead: 1 })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('Jump_Loop')
  })

  it('o slide tem clipe de slide, não de rolamento', () => {
    const pose = standing({ stance: 'sliding', horizontalSpeedMps: 8, ahead: 1 })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('Slide_Loop')
  })

  it('agachado parado tem pose própria, em vez de ficar de pé', () => {
    const pose = standing({ stance: 'crouching' })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('Crouch_Idle_Loop')
  })

  it('agachado andando anda agachado, na velocidade de agachado', () => {
    const pose = standing({ stance: 'crouching', horizontalSpeedMps: movement.crouchSpeedMps })
    expect(thirdPersonClipFor(pose, movement)).toEqual({
      clip: 'Crouch_Fwd_Loop',
      loop: true,
      speedRatio: 1,
    })
  })

  /** O slide acontece no chão e no ar; em nenhum dos dois o corpo pisa. */
  it('deslizar ganha do ar e do agachado', () => {
    const pose = standing({ stance: 'sliding', grounded: false, horizontalSpeedMps: 8 })
    expect(thirdPersonClipFor(pose, movement).clip).toBe('Slide_Loop')
  })
})

describe('poseOfLocalCharacter', () => {
  it('lê a postura, o chão e a velocidade do estado do núcleo', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    state.velocity.x = 3
    state.grounded = true
    const pose = poseOfLocalCharacter(state, createHeldKeys(), createLocomotionPose())
    expect(pose.grounded).toBe(true)
    expect(pose.horizontalSpeedMps).toBeCloseTo(3)
    expect(pose.stance).toBe('standing')
  })

  /**
   * A direção relativa ao corpo vem do teclado, não da velocidade em mundo: a
   * velocidade não sabe para onde o jogador olha, e o strafe é justamente isso.
   */
  it('a direção relativa ao corpo vem das teclas', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    const keys = createHeldKeys()
    keys.back = true
    keys.right = true
    const pose = poseOfLocalCharacter(state, keys, createLocomotionPose())
    expect(pose.ahead).toBe(-1)
    expect(pose.side).toBe(1)
  })

  /** O par oposto do caso acima: sem ele, o sinal positivo do eixo nunca roda. */
  it('frente e direita presas dão o eixo positivo nos dois', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    const keys = { ...createHeldKeys(), forward: true, right: true }
    const pose = poseOfLocalCharacter(state, keys, createLocomotionPose())
    expect(pose.ahead).toBe(1)
    expect(pose.side).toBe(1)
  })

  it('teclas opostas se cancelam', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    const keys = createHeldKeys()
    keys.forward = true
    keys.back = true
    const pose = poseOfLocalCharacter(state, keys, createLocomotionPose())
    expect(pose.ahead).toBe(0)
  })

  it('reaproveita a pose recebida, sem alocar por quadro', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    const pose = createLocomotionPose()
    expect(poseOfLocalCharacter(state, createHeldKeys(), pose)).toBe(pose)
  })
})
