import { describe, expect, it } from 'vitest'
import { boxFromCenterSize, type StaticBox } from '../collision/staticBox.ts'
import { type CharacterState, copyCharacterState, createCharacterState } from './characterState.ts'
import type { MovementInput } from './movementInput.ts'
import { FLOOR, shippedConfig, tickDurationS } from './movementTestKit.ts'
import { stepCharacter } from './stepCharacter.ts'

/**
 * O teste de replay determinístico que a ADR 0003 torna obrigatório: gravar
 * uma sequência de entradas, reexecutar e comparar o estado. É a rede de
 * proteção contra regressão de movimentação e a trava contra `Math.random`,
 * relógio e delta variável entrando no núcleo por acidente.
 */
const config = shippedConfig()
const dtS = tickDurationS(config)

/** Um pedaço de arena fechada: piso, quatro paredes, um deck e um pilar. */
const ARENA: readonly StaticBox[] = [
  FLOOR,
  boxFromCenterSize([0, 11, 32.5], [66, 22, 1]),
  boxFromCenterSize([0, 11, -32.5], [66, 22, 1]),
  boxFromCenterSize([32.5, 11, 0], [1, 22, 66]),
  boxFromCenterSize([-32.5, 11, 0], [1, 22, 66]),
  boxFromCenterSize([12, 1.5, 12], [8, 3, 8]),
  boxFromCenterSize([16, 3.5, 16], [4, 7, 4]),
]

/**
 * Gerador congruencial linear: o roteiro de entradas é pseudoaleatório mas
 * **repetível**, que é o que um replay precisa. Não é `Math.random` de
 * propósito — a mesma semente tem que produzir a mesma partida.
 */
function scriptedInputs(seed: number, ticks: number): readonly MovementInput[] {
  const next = lcg(seed)
  // a katana tem gerador próprio: entrar no sorteio principal mudaria o roteiro
  // inteiro, e o gancho deixaria de engatar onde o teste espera.
  const nextBlade = lcg(seed ^ 0x9e37_79b9)
  // o gancho é segurado por trechos, e não sorteado por tick: sorteio por tick
  // soltaria a corda no tick seguinte ao engate, e o balanço nunca rodaria.
  const grapple = { held: false }
  return Array.from({ length: ticks }, () => ({
    ...rollInput(next, grapple),
    bladeDrawn: nextBlade() < 0.3,
    dash: nextBlade() < 0.03,
  }))
}

function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }
}

/**
 * Para onde a mira aponta: frente, lados e para cima, onde ficam o deck, o
 * pilar e as paredes. Tabela e não ângulo sorteado: seno e cosseno não entram
 * nem no roteiro do teste do núcleo.
 */
const AIMS: readonly (readonly [number, number, number])[] = [
  [0, 0.3, 1],
  [1, 0.4, 1],
  [1, 0.6, 0],
  [-1, 0.2, 0.3],
  [0, 0.5, -1],
  [0.6, 0.15, 0.6],
]

function rollInput(next: () => number, grapple: { held: boolean }): MovementInput {
  const angle = next() * 8
  const dirX = [0, 1, 1, 1, 0, -1, -1, -1][Math.floor(angle)] ?? 0
  const dirZ = [1, 1, 0, -1, -1, -1, 0, 1][Math.floor(angle)] ?? 0
  const length = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1
  const [aimX, aimY, aimZ] = AIMS[Math.floor(next() * AIMS.length)] ?? [0, 0, 1]
  if (next() < 0.04) grapple.held = !grapple.held
  return {
    wishX: next() < 0.15 ? 0 : dirX / length,
    wishZ: next() < 0.15 ? 0 : dirZ / length,
    sprint: next() < 0.6,
    jump: next() < 0.08,
    crouch: next() < 0.06,
    scoped: next() < 0.25,
    grapple: grapple.held,
    aimX,
    aimY,
    aimZ,
    // a katana e a investida têm sorteio próprio, em `scriptedInputs`: o
    // tranco da investida também tem que reproduzir bit a bit.
    bladeDrawn: false,
    dash: false,
  }
}

function replay(inputs: readonly MovementInput[], onTick?: (state: CharacterState) => void) {
  const state = createCharacterState({ x: 4, y: 0, z: 4 }, config)
  for (const input of inputs) {
    stepCharacter(state, input, ARENA, config, dtS)
    onTick?.(state)
  }
  return state
}

describe('replay determinístico', () => {
  const inputs = scriptedInputs(20_251_119, 600)

  it('a mesma sequência de entradas produz exatamente o mesmo estado', () => {
    expect(replay(inputs)).toEqual(replay(inputs))
  })

  it('o roteiro de fato exercita a mira, senão o teste protegeria pouco', () => {
    expect(inputs.some((input) => input.scoped)).toBe(true)
    expect(inputs.some((input) => !input.scoped)).toBe(true)
  })

  it('o roteiro de fato exercita pulo e slide, senão o teste protegeria pouco', () => {
    expect(inputs.some((input) => input.jump)).toBe(true)
    expect(inputs.some((input) => input.crouch)).toBe(true)
  })

  it('o roteiro de fato liga a corrida tática plena e investe', () => {
    let tacticalTicks = 0
    replay(inputs, (state) => {
      if (state.tacticalSprinting) tacticalTicks += 1
    })
    expect(tacticalTicks).toBeGreaterThan(0)
    expect(inputs.some((input) => input.dash)).toBe(true)
  })

  it('o roteiro de fato engata e balança no gancho, senão o teste protegeria pouco', () => {
    let attachedTicks = 0
    let releases = 0
    let wasAttached = false
    replay(inputs, (state) => {
      if (state.grappleAttached) attachedTicks += 1
      if (wasAttached && !state.grappleAttached) releases += 1
      wasAttached = state.grappleAttached
    })
    expect(attachedTicks).toBeGreaterThan(40)
    expect(releases).toBeGreaterThan(2)
  })

  it('o jogador termina dentro da arena e sobre alguma superfície', () => {
    const state = replay(inputs)
    expect(Math.abs(state.position.x)).toBeLessThanOrEqual(32)
    expect(Math.abs(state.position.z)).toBeLessThanOrEqual(32)
    expect(state.position.y).toBeGreaterThanOrEqual(0)
  })

  it('a cópia para interpolação é fiel, campo a campo', () => {
    const source = replay(inputs.slice(0, 200))
    const copy = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    expect(copyCharacterState(source, copy)).toEqual(source)
    expect(copy).not.toBe(source)
  })
})
