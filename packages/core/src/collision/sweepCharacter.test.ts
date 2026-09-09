import { describe, expect, it } from 'vitest'
import { createCharacterState } from '../movement/characterState.ts'
import { FLOOR, shippedConfig, tickDurationS } from '../movement/movementTestKit.ts'
import { boxFromCenterSize } from './staticBox.ts'
import { subStepCount, sweepCharacter } from './sweepCharacter.ts'

const config = shippedConfig()
const dtS = tickDurationS(config)
const radius = config.collision.capsuleRadiusM

/** Parede de 1 m de espessura, com a face oeste em x = 5. */
const WALL = boxFromCenterSize([5.5, 5, 0], [1, 10, 20])

/** A mesma parede girada: a face norte em z = 5. */
const WALL_Z = boxFromCenterSize([0, 5, 5.5], [20, 10, 1])

describe('sweepCharacter', () => {
  it('apoia no chão quem cai e zera a velocidade vertical', () => {
    const state = createCharacterState({ x: 0, y: 0.1, z: 0 }, config)
    state.velocity.y = -10
    sweepCharacter(state, [FLOOR], config, dtS)
    expect(state.position.y).toBe(0)
    expect(state.velocity.y).toBe(0)
    expect(state.grounded).toBe(true)
  })

  it('não vê chão a mais de 2 cm do pé', () => {
    const state = createCharacterState({ x: 0, y: 0.5, z: 0 }, config)
    sweepCharacter(state, [FLOOR], config, dtS)
    expect(state.grounded).toBe(false)
  })

  it('parede para o jogador encostado na face e mata a velocidade do eixo', () => {
    const state = createCharacterState({ x: 4.5, y: 0, z: 0 }, config)
    state.velocity.x = 20
    sweepCharacter(state, [FLOOR, WALL], config, dtS)
    expect(state.position.x).toBe(5 - radius)
    expect(state.velocity.x).toBe(0)
  })

  /** O mesmo em z: os dois eixos horizontais resolvem por caminhos separados. */
  it('parede em z para o jogador e mata a velocidade do eixo', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 4.5 }, config)
    state.velocity.z = 20
    sweepCharacter(state, [FLOOR, WALL_Z], config, dtS)
    expect(state.position.z).toBe(5 - radius)
    expect(state.velocity.z).toBe(0)
  })

  /**
   * O caso que justifica o sub-passo (ADR 0003): a 100 m/s o deslocamento por
   * tick é 1,67 m, dezesseis vezes a espessura da parede. Sem dividir o
   * passo, o jogador apareceria do outro lado.
   */
  it('não atravessa parede fina em alta velocidade', () => {
    const thin = boxFromCenterSize([5.05, 5, 0], [0.1, 10, 20])
    const state = createCharacterState({ x: 3, y: 0, z: 0 }, config)
    state.velocity.x = 100
    sweepCharacter(state, [FLOOR, thin], config, dtS)
    expect(state.position.x).toBe(5 - radius)
  })

  it('sobe degrau menor que stepHeightM sem parar', () => {
    const step = boxFromCenterSize([2, 0.15, 0], [2, 0.3, 4])
    const state = createCharacterState({ x: 0.5, y: 0, z: 0 }, config)
    state.grounded = true
    state.velocity.x = 9
    sweepCharacter(state, [FLOOR, step], config, dtS)
    expect(state.position.y).toBe(0.3)
    expect(state.velocity.x).toBe(9)
  })

  it('trata bloco mais alto que o degrau como parede', () => {
    const block = boxFromCenterSize([2, 0.3, 0], [2, 0.6, 4])
    const state = createCharacterState({ x: 0.5, y: 0, z: 0 }, config)
    state.grounded = true
    state.velocity.x = 9
    sweepCharacter(state, [FLOOR, block], config, dtS)
    expect(state.position.y).toBe(0)
    expect(state.velocity.x).toBe(0)
  })

  /** No ar, borda é borda: subir degrau em pleno pulo seria teleporte. */
  it('não sobe degrau se não estava no chão', () => {
    const step = boxFromCenterSize([2, 0.15, 0], [2, 0.3, 4])
    const state = createCharacterState({ x: 0.5, y: 0, z: 0 }, config)
    state.grounded = false
    state.velocity.x = 9
    sweepCharacter(state, [FLOOR, step], config, dtS)
    expect(state.position.y).toBe(0)
    expect(state.velocity.x).toBe(0)
  })

  /**
   * Regressão: encostado numa parede, `18.4 - 0.4` dá `17.999…` e a face
   * encostada virava interseção na varredura vertical — a gravidade punha o
   * jogador no topo da parede. A pele de colisão é o que impede isso.
   */
  it('encostado na parede, a gravidade não aterrissa no topo dela', () => {
    const pillar = boxFromCenterSize([16, 3.5, 16], [4, 7, 4])
    const state = createCharacterState({ x: 18.4, y: 0, z: 16 }, config)
    state.velocity.y = -0.4
    sweepCharacter(state, [FLOOR, pillar], config, dtS)
    expect(state.position.y).toBe(0)
    expect(state.grounded).toBe(true)
  })

  it('encostado na parede no ar, não conta como chão', () => {
    const pillar = boxFromCenterSize([16, 3.5, 16], [4, 7, 4])
    const state = createCharacterState({ x: 18.4, y: 2, z: 16 }, config)
    sweepCharacter(state, [FLOOR, pillar], config, dtS)
    expect(state.grounded).toBe(false)
  })

  it('teto para quem sobe', () => {
    const ceiling = boxFromCenterSize([0, 2.5, 0], [10, 1, 10])
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    state.velocity.y = 30
    sweepCharacter(state, [FLOOR, ceiling], config, dtS)
    expect(state.position.y).toBeCloseTo(2 - config.collision.capsuleHeightM)
    expect(state.velocity.y).toBe(0)
  })
})

describe('subStepCount', () => {
  it('é um passo quando o deslocamento cabe no máximo', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    state.velocity.x = 9
    expect(subStepCount(state, config, dtS)).toBe(1)
  })

  it('divide pelo deslocamento máximo, arredondando para cima', () => {
    const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    state.velocity.x = 100
    // 100 / 60 = 1,67 m por tick, sobre 0,2 m por sub-passo
    expect(subStepCount(state, config, dtS)).toBe(9)
  })
})
