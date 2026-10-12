import { describe, expect, it } from 'vitest'
import { stepWeapon } from './stepWeapon.ts'
import { IDLE_WEAPON_INPUT } from './weaponInput.ts'
import { weaponHoldsSprint } from './weaponState.ts'
import {
  AIM,
  armedWeapon,
  FIRE,
  runTicks,
  SCOPE,
  shippedConfig,
  tapButton,
  tickDurationS,
  ticksFor,
} from './weaponTestKit.ts'

const config = shippedConfig()
const AIM_AND_FIRE = { ...AIM, fire: true }

/**
 * A mira de segurar do controle (pedido de 11/10: "mirar deve ser segurar, e
 * não alternar"). O mouse continua alternando — `stepWeapon: mira` cobre ele.
 */
describe('stepWeapon: mira de segurar', () => {
  it('abre enquanto o gatilho está preso e fecha ao soltar', () => {
    const weapon = runTicks(armedWeapon(config), AIM, 3, config)
    expect(weapon.scoped).toBe(true)
    runTicks(weapon, IDLE_WEAPON_INPUT, 1, config)
    expect(weapon.scoped).toBe(false)
  })

  it('preso o jogo inteiro não alterna: a luneta continua aberta', () => {
    const weapon = runTicks(armedWeapon(config), AIM, ticksFor(5, config), config)
    expect(weapon.scoped).toBe(true)
  })

  it('o disparo fecha, e a luneta só reabre quando o ferrolho termina', () => {
    const weapon = runTicks(armedWeapon(config), AIM, 3, config)
    runTicks(weapon, AIM_AND_FIRE, 1, config)
    expect([weapon.firedThisTick, weapon.firedScoped, weapon.scoped]).toEqual([true, true, false])
    runTicks(weapon, AIM, ticksFor(config.weapon.boltCycleS, config) - 2, config)
    expect(weapon.scoped).toBe(false)
    runTicks(weapon, AIM, 3, config)
    expect(weapon.scoped).toBe(true)
  })

  it('correndo, a mira presa espera a arma subir e segura a corrida', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, AIM, config, tickDurationS(config), config.weapon.sprintToFireS)
    expect(weapon.scoped).toBe(false)
    expect(weaponHoldsSprint(weapon)).toBe(true)
    runTicks(weapon, AIM, ticksFor(config.weapon.sprintToFireS, config) + 1, config)
    expect(weapon.scoped).toBe(true)
  })

  it('soltar enquanto a arma sobe esquece o pedido', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, AIM, config, tickDurationS(config), config.weapon.sprintToFireS)
    runTicks(weapon, IDLE_WEAPON_INPUT, ticksFor(config.weapon.sprintToFireS, config) + 1, config)
    expect([weapon.scoped, weapon.scopeQueued]).toEqual([false, false])
  })

  /** O pedido guardado é de alternar: sem a guarda, fechava e reabria, e a mira assentada voltava a zero. */
  it('preso com a luneta já aberta e a arma subindo, não a fecha nem desassenta', () => {
    const weapon = runTicks(armedWeapon(config), AIM, 2, config)
    weapon.readyLeftS = 0.2
    runTicks(weapon, AIM, ticksFor(0.2, config) + 2, config)
    expect(weapon.scoped).toBe(true)
    expect(weapon.scopedForS).toBeGreaterThan(0.2)
  })

  /** Revisão do núcleo: sem isto o corpo corria no tick do disparo, e a corrida abaixava a arma. */
  it('preso, segura a corrida também no tick do disparo, quando a luneta fecha', () => {
    const weapon = runTicks(armedWeapon(config), AIM, 3, config)
    runTicks(weapon, AIM_AND_FIRE, 1, config)
    expect([weapon.firedThisTick, weapon.scoped]).toEqual([true, false])
    expect(weaponHoldsSprint(weapon)).toBe(true)
  })

  /** Revisão do núcleo: o pedido guardado alternava a luneta aberta com o ferrolho em curso. */
  it('a arma subindo durante o ferrolho não reabre a luneta antes de ele terminar', () => {
    const weapon = runTicks(armedWeapon(config), AIM, 3, config)
    runTicks(weapon, AIM_AND_FIRE, 1, config)
    weapon.readyLeftS = config.weapon.boltCycleS / 4
    runTicks(weapon, AIM, ticksFor(config.weapon.boltCycleS / 2, config), config)
    expect(weapon.boltLeftS).toBeGreaterThan(0)
    expect(weapon.scoped).toBe(false)
    runTicks(weapon, AIM, ticksFor(config.weapon.boltCycleS, config), config)
    expect(weapon.scoped).toBe(true)
  })

  it('o clique do mouse ainda alterna com o gatilho solto', () => {
    const weapon = tapButton(armedWeapon(config), SCOPE, config)
    expect(weapon.scoped).toBe(true)
    tapButton(weapon, SCOPE, config)
    expect(weapon.scoped).toBe(false)
  })

  it('o gatilho preso sem tiro não dispara nada', () => {
    const weapon = runTicks(armedWeapon(config), AIM, 10, config)
    expect(weapon.shotsFired).toBe(0)
    runTicks(weapon, FIRE, 1, config)
    expect(weapon.shotsFired).toBe(1)
  })
})
