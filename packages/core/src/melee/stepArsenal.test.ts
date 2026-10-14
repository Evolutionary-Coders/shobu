import { describe, expect, it } from 'vitest'
import { createCharacterState } from '../movement/characterState.ts'
import { IDLE_INPUT } from '../movement/movementInput.ts'
import { IDLE_WEAPON_INPUT, type WeaponInput } from '../weapon/weaponInput.ts'
import { createWeaponState } from '../weapon/weaponState.ts'
import { createMeleeState, type MeleeWeapon } from './meleeState.ts'
import { MELEE, PRIMARY, SLASH, shippedConfig, tickDurationS, ticksFor } from './meleeTestKit.ts'
import { type Arsenal, armMovementInput, stepArsenal } from './stepArsenal.ts'

const config = shippedConfig()
const dtS = tickDurationS(config)
const body = createCharacterState({ x: 0, y: 0, z: 0 }, config)
body.grounded = true

function arsenalWith(weapon: MeleeWeapon): Arsenal {
  return { weapon: createWeaponState(config), melee: createMeleeState(weapon) }
}

/** A mira no plano: a investida tem para onde ir. */
const AIM_NORTH = { x: 0, y: 0, z: 1 }

function run(
  arsenal: Arsenal,
  input: WeaponInput,
  ticks: number,
  onBody = body,
  aimM = AIM_NORTH,
): Arsenal {
  for (let tick = 0; tick < ticks; tick += 1) {
    stepArsenal(arsenal, input, onBody, aimM, config, dtS)
  }
  return arsenal
}

function drawn(): Arsenal {
  const arsenal = run(arsenalWith('katana'), MELEE, ticksFor(config.melee.holdToDrawS, config) + 1)
  return run(arsenal, IDLE_WEAPON_INPUT, ticksFor(config.melee.katanaDrawS, config) + 1)
}

describe('stepArsenal', () => {
  it('a katana na mão guarda a sniper, e o tiro vira corte', () => {
    const arsenal = run(drawn(), SLASH, 1)
    expect(arsenal.weapon.holstered).toBe(true)
    expect([arsenal.weapon.shotsFired, arsenal.melee.strikes]).toEqual([0, 1])
  })

  it('guardar a katana faz a sniper esperar para subir, e o tiro pedido sai depois', () => {
    const arsenal = run(drawn(), PRIMARY, 1)
    expect(arsenal.weapon.holstered).toBe(false)
    run(arsenal, IDLE_WEAPON_INPUT, 1)
    run(arsenal, SLASH, 1)
    expect(arsenal.weapon.shotsFired).toBe(0)
    run(arsenal, IDLE_WEAPON_INPUT, ticksFor(config.melee.sniperRaiseS, config) + 1)
    expect(arsenal.weapon.shotsFired).toBe(1)
  })

  /** Revisão do núcleo: o clique que cortava ficava guardado, e a sniper atirava ao subir. */
  it('o clique que corta no tick de guardar a katana não vira tiro da sniper', () => {
    const arsenal = run(drawn(), { ...SLASH, primary: true }, 1)
    expect([arsenal.melee.struckThisTick, arsenal.weapon.holstered]).toEqual([true, false])
    run(arsenal, IDLE_WEAPON_INPUT, ticksFor(config.melee.sniperRaiseS, config) + 1)
    expect([arsenal.weapon.shotsFired, arsenal.weapon.fireQueued]).toEqual([0, false])
  })

  it('a mira de alternar no tick de guardar a katana não abre a luneta ao subir', () => {
    const arsenal = run(drawn(), { ...PRIMARY, scope: true }, 1)
    run(arsenal, IDLE_WEAPON_INPUT, ticksFor(config.melee.sniperRaiseS, config) + 1)
    expect(arsenal.weapon.scoped).toBe(false)
  })

  it('o golpe rápido fecha a luneta e não cancela a recarga', () => {
    const arsenal = arsenalWith('knife')
    arsenal.weapon.roundsInMagazine = 0
    arsenal.weapon.reloadLeftS = config.weapon.reloadS
    arsenal.weapon.scoped = true
    // o toque: o golpe sai na soltura.
    run(arsenal, MELEE, 1)
    run(arsenal, IDLE_WEAPON_INPUT, 1)
    expect(arsenal.melee.struckThisTick).toBe(true)
    expect(arsenal.weapon.scoped).toBe(false)
    expect(arsenal.weapon.reloadLeftS).toBeGreaterThan(0)
  })

  it('correndo a sniper fica abaixada; na corrida plena, mais tempo', () => {
    const sprinting = { ...body, sprinting: true }
    const sprint = run(arsenalWith('knife'), IDLE_WEAPON_INPUT, 1, sprinting)
    const tactical = run(arsenalWith('knife'), IDLE_WEAPON_INPUT, 1, {
      ...sprinting,
      tacticalSprinting: true,
    })
    expect(sprint.weapon.readyLeftS).toBe(config.weapon.sprintToFireS)
    expect(tactical.weapon.readyLeftS).toBe(config.weapon.tacticalSprintToFireS)
  })

  it('o corpo recebe a mira, a katana e a investida do estado', () => {
    const arsenal = run(drawn(), { ...IDLE_WEAPON_INPUT, scope: true }, 1)
    const input = { ...IDLE_INPUT }
    armMovementInput(arsenal, input)
    expect([input.scoped, input.drawnBlade, input.dash]).toEqual([false, 'katana', true])
  })

  /** Só a lâmina empunhada é mais leve: o golpe rápido sai e volta com a sniper na mão. */
  it('o golpe rápido com a sniper na mão não dá a velocidade da lâmina', () => {
    for (const weapon of ['katana', 'knife'] as const) {
      const arsenal = run(run(arsenalWith(weapon), MELEE, 1), IDLE_WEAPON_INPUT, 1)
      const input = { ...IDLE_INPUT, drawnBlade: weapon }
      armMovementInput(arsenal, input)
      expect([arsenal.melee.strikes, input.drawnBlade], weapon).toEqual([1, null])
    }
  })

  it('a faca empunhada chega ao corpo como faca', () => {
    const arsenal = run(arsenalWith('knife'), MELEE, ticksFor(config.melee.holdToDrawS, config) + 1)
    const input = { ...IDLE_INPUT }
    armMovementInput(arsenal, input)
    expect(input.drawnBlade).toBe('knife')
  })

  it('o tiro esperando a sniper subir segura a corrida do corpo', () => {
    const arsenal = run(arsenalWith('knife'), SLASH, 1, { ...body, sprinting: true })
    const input = { ...IDLE_INPUT }
    armMovementInput(arsenal, input)
    expect([arsenal.weapon.fireQueued, input.sprintHeldByWeapon]).toEqual([true, true])
  })

  /** Revisão do núcleo: a recarga da investida era gasta sem o corpo sair do lugar. */
  it('agachado, a mira não gasta a investida que o corpo não daria', () => {
    const arsenal = run(drawn(), { ...IDLE_WEAPON_INPUT, scope: true }, 1, {
      ...body,
      stance: 'crouching',
    })
    expect([arsenal.melee.dashedThisTick, arsenal.melee.dashCooldownLeftS]).toEqual([false, 0])
  })

  it('com a mira na vertical, também não', () => {
    const arsenal = run(drawn(), { ...IDLE_WEAPON_INPUT, scope: true }, 1, body, {
      x: 0,
      y: 1,
      z: 0,
    })
    expect([arsenal.melee.dashedThisTick, arsenal.melee.dashCooldownLeftS]).toEqual([false, 0])
  })
})
