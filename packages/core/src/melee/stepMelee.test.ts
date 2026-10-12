import { describe, expect, it } from 'vitest'
import { IDLE_WEAPON_INPUT } from '../weapon/weaponInput.ts'
import { createMeleeState, rearmMelee } from './meleeState.ts'
import {
  DASH,
  MELEE,
  PRIMARY,
  pressFor,
  runMelee,
  SLASH,
  shippedConfig,
  tickDurationS,
  ticksFor,
} from './meleeTestKit.ts'
import { stepMelee } from './stepMelee.ts'

const config = shippedConfig()
const { melee } = config
const TAP_S = 0.08

/** A katana empunhada e pronta: segurou, soltou, e o saque terminou. */
function drawnKatana() {
  const state = pressFor(createMeleeState('katana'), melee.holdToDrawS + 0.05, config)
  return runMelee(state, IDLE_WEAPON_INPUT, ticksFor(melee.katanaDrawS, config) + 1, config)
}

/** A faca empunhada e pronta, como a katana: segurou, soltou, e o saque terminou. */
function drawnKnife() {
  const state = pressFor(createMeleeState('knife'), melee.holdToDrawS + 0.05, config)
  return runMelee(state, IDLE_WEAPON_INPUT, ticksFor(melee.knifeDrawS, config) + 1, config)
}

/**
 * A faca segue a regra da katana desde o playtest de 11/10 ("não consigo
 * segurar a faca na mão segurando V"): antes ela golpeava na descida e
 * segurar não fazia nada.
 */
describe('faca: tocar e segurar', () => {
  it('tocar golpeia na soltura, com a sniper ainda na mão', () => {
    const state = runMelee(createMeleeState('knife'), MELEE, ticksFor(TAP_S, config), config)
    expect(state.strikes).toBe(0)
    runMelee(state, IDLE_WEAPON_INPUT, 1, config)
    expect([state.struckThisTick, state.strikeKind, state.bladeDrawn]).toEqual([
      true,
      'quick',
      false,
    ])
  })

  it('segurar até o limiar empunha a faca, sem golpear', () => {
    const state = runMelee(
      createMeleeState('knife'),
      MELEE,
      ticksFor(melee.holdToDrawS, config) + 1,
      config,
    )
    expect([state.bladeDrawn, state.strikes, state.drawLeftS > 0]).toEqual([true, 0, true])
    runMelee(state, IDLE_WEAPON_INPUT, 1, config)
    expect(state.strikes).toBe(0)
  })

  it('o saque da faca dura o dela, não o da katana', () => {
    const state = createMeleeState('knife')
    while (!state.bladeDrawn) runMelee(state, MELEE, 1, config)
    expect(state.drawLeftS).toBe(melee.knifeDrawS)
  })

  it('a recarga do golpe recusa o segundo e libera depois', () => {
    const state = pressFor(createMeleeState('knife'), TAP_S, config)
    pressFor(state, TAP_S, config)
    expect(state.strikes).toBe(1)
    runMelee(state, IDLE_WEAPON_INPUT, ticksFor(melee.knifeCooldownS, config), config)
    pressFor(state, TAP_S, config)
    expect(state.strikes).toBe(2)
  })
})

describe('faca na mão', () => {
  it('o tiro vira facada, com a recarga da faca', () => {
    const state = runMelee(drawnKnife(), SLASH, 1, config)
    expect([state.struckThisTick, state.strikeKind]).toEqual([true, 'slash'])
    expect(state.cooldownLeftS).toBe(melee.knifeCooldownS)
  })

  it('tocar a tecla também golpeia', () => {
    const state = pressFor(drawnKnife(), TAP_S, config)
    expect([state.strikes, state.bladeDrawn]).toEqual([1, true])
  })

  it('a mira não investe: a investida é da katana', () => {
    const state = runMelee(drawnKnife(), DASH, 1, config)
    expect(state.dashedThisTick).toBe(false)
  })

  it('voltam à sniper: segurar a tecla de novo e a tecla 1', () => {
    expect(pressFor(drawnKnife(), melee.holdToDrawS + 0.05, config).bladeDrawn).toBe(false)
    expect(runMelee(drawnKnife(), PRIMARY, 1, config).bladeDrawn).toBe(false)
  })
})

describe('katana: tocar e segurar', () => {
  it('tocar golpeia na soltura, com a sniper ainda na mão', () => {
    const state = runMelee(createMeleeState('katana'), MELEE, ticksFor(TAP_S, config), config)
    expect(state.strikes).toBe(0)
    runMelee(state, IDLE_WEAPON_INPUT, 1, config)
    expect([state.struckThisTick, state.strikeKind, state.bladeDrawn]).toEqual([
      true,
      'quick',
      false,
    ])
  })

  it('o golpe rápido de katana tem recarga própria', () => {
    const state = pressFor(createMeleeState('katana'), TAP_S, config)
    expect(state.cooldownLeftS).toBe(melee.katanaQuickCooldownS)
  })

  it('segurar até o limiar empunha, sem golpear, e soltar depois não golpeia', () => {
    const state = runMelee(
      createMeleeState('katana'),
      MELEE,
      ticksFor(melee.holdToDrawS, config) + 1,
      config,
    )
    expect([state.bladeDrawn, state.strikes]).toEqual([true, 0])
    runMelee(state, IDLE_WEAPON_INPUT, 1, config)
    expect(state.strikes).toBe(0)
  })

  it('segurar de novo guarda a katana', () => {
    const state = pressFor(drawnKatana(), melee.holdToDrawS + 0.05, config)
    expect(state.bladeDrawn).toBe(false)
  })

  it('a tecla 1 guarda a katana', () => {
    expect(runMelee(drawnKatana(), PRIMARY, 1, config).bladeDrawn).toBe(false)
  })

  it('a tecla 1 sem a katana na mão não faz nada', () => {
    expect(runMelee(createMeleeState('katana'), PRIMARY, 1, config).bladeDrawn).toBe(false)
  })
})

describe('katana na mão', () => {
  it('o tiro vira corte', () => {
    const state = runMelee(drawnKatana(), SLASH, 1, config)
    expect([state.struckThisTick, state.strikeKind]).toEqual([true, 'slash'])
    expect(state.cooldownLeftS).toBe(melee.katanaSlashCooldownS)
  })

  it('tocar a tecla também corta', () => {
    const state = pressFor(drawnKatana(), TAP_S, config)
    expect(state.strikeKind).toBe('slash')
    expect(state.strikes).toBe(1)
  })

  it('não corta enquanto saca', () => {
    const state = pressFor(createMeleeState('katana'), melee.holdToDrawS + 0.05, config)
    state.drawLeftS = melee.katanaDrawS
    runMelee(state, SLASH, 1, config)
    expect(state.strikes).toBe(0)
  })

  it('a mira vira investida no chão, com recarga', () => {
    const state = runMelee(drawnKatana(), DASH, 1, config)
    expect(state.dashedThisTick).toBe(true)
    runMelee(state, IDLE_WEAPON_INPUT, 1, config)
    runMelee(state, DASH, 1, config)
    expect(state.dashedThisTick).toBe(false)
  })

  it('no ar não investe', () => {
    const state = drawnKatana()
    stepMelee(state, DASH, false, config, tickDurationS(config))
    expect(state.dashedThisTick).toBe(false)
  })

  it('não investe enquanto saca', () => {
    const state = drawnKatana()
    state.drawLeftS = 1
    runMelee(state, DASH, 1, config)
    expect(state.dashedThisTick).toBe(false)
  })
})

describe('rearmMelee', () => {
  it('a tecla presa através da morte não golpeia ao soltar nem empunha de novo', () => {
    const state = runMelee(createMeleeState('katana'), MELEE, 2, config)
    rearmMelee(state)
    runMelee(state, MELEE, ticksFor(1, config), config)
    runMelee(state, IDLE_WEAPON_INPUT, 1, config)
    expect([state.bladeDrawn, state.strikes]).toEqual([false, 0])
  })

  it('volta à sniper e mantém a identidade dos golpes', () => {
    const state = runMelee(drawnKatana(), SLASH, 1, config)
    rearmMelee(state)
    expect([state.bladeDrawn, state.cooldownLeftS, state.strikes, state.weapon]).toEqual([
      false,
      0,
      1,
      'katana',
    ])
  })
})
