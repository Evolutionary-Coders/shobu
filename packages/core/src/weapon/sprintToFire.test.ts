import { describe, expect, it } from 'vitest'
import { stepWeapon } from './stepWeapon.ts'
import { IDLE_WEAPON_INPUT } from './weaponInput.ts'
import { weaponHoldsSprint } from './weaponState.ts'
import {
  armedWeapon,
  FIRE,
  RELOAD,
  runTicks,
  SCOPE,
  shippedConfig,
  tickDurationS,
  ticksFor,
} from './weaponTestKit.ts'

const config = shippedConfig()
const dtS = tickDurationS(config)
const LOWERED_S = config.weapon.sprintToFireS

describe('sprint-to-fire', () => {
  it('correndo, o tiro pedido espera e a arma pede para o corpo parar de correr', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, FIRE, config, dtS, LOWERED_S)
    expect([weapon.firedThisTick, weapon.fireQueued]).toEqual([false, true])
    expect(weaponHoldsSprint(weapon)).toBe(true)
  })

  it('o tiro guardado sai quando a arma termina de subir, mesmo com o botão solto', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, FIRE, config, dtS, LOWERED_S)
    runTicks(weapon, IDLE_WEAPON_INPUT, ticksFor(LOWERED_S, config) - 1, config)
    expect(weapon.shotsFired).toBe(0)
    runTicks(weapon, IDLE_WEAPON_INPUT, 2, config) // o ponto flutuante pede um tick de folga
    expect(weapon.shotsFired).toBe(1)
    expect(weapon.fireQueued).toBe(false)
  })

  it('enquanto a corrida dura, o tempo de subir é reposto', () => {
    const weapon = armedWeapon(config)
    for (let tick = 0; tick < 30; tick += 1) stepWeapon(weapon, FIRE, config, dtS, LOWERED_S)
    expect(weapon.shotsFired).toBe(0)
    expect(weapon.readyLeftS).toBe(LOWERED_S)
  })

  it('a mira pedida correndo também espera, e abre ao subir', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, SCOPE, config, dtS, LOWERED_S)
    expect([weapon.scoped, weapon.scopeQueued]).toEqual([false, true])
    runTicks(weapon, IDLE_WEAPON_INPUT, ticksFor(LOWERED_S, config) + 1, config)
    expect(weapon.scoped).toBe(true)
  })

  it('a recarga não espera a arma subir', () => {
    const weapon = armedWeapon(config)
    weapon.roundsInMagazine = 1
    stepWeapon(weapon, RELOAD, config, dtS, LOWERED_S)
    expect(weapon.reloadLeftS).toBeGreaterThan(0)
  })

  it('parada, sem corrida, a arma não segura o corpo', () => {
    expect(weaponHoldsSprint(armedWeapon(config))).toBe(false)
  })
})

describe('sniper no coldre', () => {
  it('não atira, não mira e fecha a mira que estava aberta', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, SCOPE, config, dtS)
    weapon.holstered = true
    stepWeapon(weapon, IDLE_WEAPON_INPUT, config, dtS)
    stepWeapon(weapon, FIRE, config, dtS)
    expect([weapon.scoped, weapon.shotsFired, weapon.fireQueued]).toEqual([false, 0, false])
  })

  it('a recarga continua no coldre', () => {
    const weapon = armedWeapon(config)
    weapon.roundsInMagazine = 0
    weapon.reloadLeftS = config.weapon.reloadS
    weapon.holstered = true
    runTicks(weapon, IDLE_WEAPON_INPUT, ticksFor(config.weapon.reloadS, config) + 1, config)
    expect(weapon.roundsInMagazine).toBe(config.weapon.magazineRounds)
  })

  it('o botão preso no coldre não vira tiro ao sacar a sniper', () => {
    const weapon = armedWeapon(config)
    weapon.holstered = true
    stepWeapon(weapon, FIRE, config, dtS)
    weapon.holstered = false
    stepWeapon(weapon, FIRE, config, dtS)
    expect(weapon.shotsFired).toBe(0)
  })
})
