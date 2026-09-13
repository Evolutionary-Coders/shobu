import { describe, expect, it } from 'vitest'
import {
  canFire,
  copyWeaponState,
  createWeaponState,
  isExactShot,
  isReloading,
  weaponPhase,
} from './weaponState.ts'
import { armedWeapon, shippedConfig } from './weaponTestKit.ts'

const config = shippedConfig()

describe('createWeaponState', () => {
  it('nasce com o pente cheio pela config, não por literal', () => {
    expect(createWeaponState(config).roundsInMagazine).toBe(config.weapon.magazineRounds)
  })

  it('nasce pronta: sem ferrolho, sem recarga, sem mira e sem tiro', () => {
    const weapon = createWeaponState(config)
    expect(weaponPhase(weapon)).toBe('ready')
    expect(canFire(weapon)).toBe(true)
    expect(isReloading(weapon)).toBe(false)
    expect(weapon.shotsFired).toBe(0)
  })
})

/**
 * A cópia é a peça da **reconciliação** (ADR 0002): o cliente substitui o
 * estado pelo do servidor e reexecuta os ticks desde então. Um campo esquecido
 * aqui vira divergência que só aparece sob perda de pacote, então o teste
 * compara o objeto inteiro em vez de conferir campo a campo — campo novo em
 * `WeaponState` que ninguém copiar cai aqui.
 */
describe('copyWeaponState', () => {
  it('copia todo campo do estado, sem deixar nenhum para trás', () => {
    const from = armedWeapon(config)
    from.roundsInMagazine = 2
    from.boltLeftS = 0.4
    from.reloadLeftS = 1.1
    from.scoped = true
    from.scopedForS = 0.25
    from.firedThisTick = true
    from.shotsFired = 7
    from.firedScoped = true
    from.firedExact = true
    from.fireWasHeld = true
    from.scopeWasHeld = true
    from.reloadWasHeld = true
    expect(copyWeaponState(from, createWeaponState(config))).toEqual(from)
  })

  it('escreve no destino recebido e o devolve, sem alocar outro', () => {
    const into = createWeaponState(config)
    expect(copyWeaponState(armedWeapon(config), into)).toBe(into)
  })

  it('não liga os dois estados: mexer na cópia não mexe na origem', () => {
    const from = armedWeapon(config)
    const into = copyWeaponState(from, createWeaponState(config))
    into.roundsInMagazine = 0
    expect(from.roundsInMagazine).toBe(config.weapon.magazineRounds)
  })
})

describe('canFire', () => {
  it('recusa com o ferrolho em curso, mesmo com bala no pente', () => {
    const weapon = armedWeapon(config)
    weapon.boltLeftS = 0.5
    expect(canFire(weapon)).toBe(false)
  })

  it('recusa com o pente vazio, mesmo com o ferrolho fechado', () => {
    const weapon = armedWeapon(config)
    weapon.roundsInMagazine = 0
    expect(canFire(weapon)).toBe(false)
  })
})

describe('isReloading', () => {
  it('é verdade só enquanto sobra tempo de recarga', () => {
    const weapon = armedWeapon(config)
    expect(isReloading(weapon)).toBe(false)
    weapon.reloadLeftS = 0.01
    expect(isReloading(weapon)).toBe(true)
  })
})

/**
 * O par que faz o quick scope existir: `scopeSettleS` é menor que o
 * `scopeTransitionS` do render, então a precisão total chega **antes** de o
 * zoom terminar. Fixar a fronteira aqui impede que alguém "arredonde" um dos
 * dois e mate a mecânica sem notar.
 */
describe('isExactShot', () => {
  it('exige mira aberta: fora da luneta nunca é exato', () => {
    const weapon = armedWeapon(config)
    weapon.scopedForS = 10
    expect(isExactShot(weapon, config)).toBe(false)
  })

  it('exige o assentamento: mira recém-aberta ainda espalha', () => {
    const weapon = armedWeapon(config)
    weapon.scoped = true
    weapon.scopedForS = config.weapon.scopeSettleS / 2
    expect(isExactShot(weapon, config)).toBe(false)
  })

  it('vira exato no instante do assentamento, não depois dele', () => {
    const weapon = armedWeapon(config)
    weapon.scoped = true
    weapon.scopedForS = config.weapon.scopeSettleS
    expect(isExactShot(weapon, config)).toBe(true)
  })
})

describe('weaponPhase', () => {
  it('o disparo do tick ganha da recarga e do ferrolho', () => {
    const weapon = armedWeapon(config)
    weapon.firedThisTick = true
    weapon.reloadLeftS = 1
    weapon.boltLeftS = 1
    expect(weaponPhase(weapon)).toBe('firing')
  })

  it('a recarga ganha do ferrolho', () => {
    const weapon = armedWeapon(config)
    weapon.reloadLeftS = 1
    weapon.boltLeftS = 1
    expect(weaponPhase(weapon)).toBe('reloading')
  })

  it('o ferrolho sozinho é cycling', () => {
    const weapon = armedWeapon(config)
    weapon.boltLeftS = 1
    expect(weaponPhase(weapon)).toBe('cycling')
  })
})
