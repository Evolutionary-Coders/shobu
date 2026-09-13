import { describe, expect, it } from 'vitest'
import { createCharacterState } from '../movement/characterState.ts'
import { stepWeapon } from './stepWeapon.ts'
import { IDLE_WEAPON_INPUT } from './weaponInput.ts'
import { isExactShot, weaponPhase } from './weaponState.ts'
import {
  armedWeapon,
  FIRE,
  RELOAD,
  runTicks,
  SCOPE,
  shippedConfig,
  tapButton,
  tickDurationS,
  ticksFor,
} from './weaponTestKit.ts'

const config = shippedConfig()
const dtS = tickDurationS(config)

describe('stepWeapon: disparo', () => {
  it('atira com o botão e consome uma bala do pente', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, FIRE, config, dtS)
    expect(weapon.firedThisTick).toBe(true)
    expect(weapon.roundsInMagazine).toBe(config.weapon.magazineRounds - 1)
    expect(weapon.shotsFired).toBe(1)
  })

  /** É ferrolho: segurar o gatilho não é rajada. */
  it('segurar o botão não dispara duas vezes', () => {
    const weapon = runTicks(armedWeapon(config), FIRE, 200, config)
    expect(weapon.shotsFired).toBe(1)
  })

  it('recusa o segundo tiro enquanto o ferrolho não fecha', () => {
    const weapon = armedWeapon(config)
    tapButton(weapon, FIRE, config)
    tapButton(weapon, FIRE, config)
    expect(weapon.shotsFired).toBe(1)
  })

  it('libera o tiro quando o ferrolho fecha', () => {
    const weapon = armedWeapon(config)
    tapButton(weapon, FIRE, config)
    runTicks(weapon, IDLE_WEAPON_INPUT, ticksFor(config.weapon.boltCycleS, config) + 1, config)
    tapButton(weapon, FIRE, config)
    expect(weapon.shotsFired).toBe(2)
  })

  it('o resultado do tiro vale só no tick dele', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, FIRE, config, dtS)
    stepWeapon(weapon, FIRE, config, dtS)
    expect(weapon.firedThisTick).toBe(false)
  })

  it('recusa duração de tick que não avança', () => {
    expect(() => stepWeapon(armedWeapon(config), FIRE, config, 0)).toThrow(/dtS recebeu 0/)
  })
})

describe('stepWeapon: pente e recarga', () => {
  function emptyTheMagazine(): ReturnType<typeof armedWeapon> {
    const weapon = armedWeapon(config)
    for (let shot = 0; shot < config.weapon.magazineRounds; shot += 1) {
      tapButton(weapon, FIRE, config)
      runTicks(weapon, IDLE_WEAPON_INPUT, ticksFor(config.weapon.boltCycleS, config) + 1, config)
    }
    return weapon
  }

  /** "Munição não é recurso a gerenciar": o jogador nunca leva um gatilho morto. */
  it('esvaziar o pente começa a recarga sozinho', () => {
    const weapon = armedWeapon(config)
    for (let shot = 0; shot < config.weapon.magazineRounds - 1; shot += 1) {
      tapButton(weapon, FIRE, config)
      runTicks(weapon, IDLE_WEAPON_INPUT, ticksFor(config.weapon.boltCycleS, config) + 1, config)
    }
    tapButton(weapon, FIRE, config)
    expect(weapon.roundsInMagazine).toBe(0)
    expect(weapon.reloadLeftS).toBeGreaterThan(0)
  })

  it('a recarga devolve o pente cheio, e só no fim', () => {
    const weapon = armedWeapon(config)
    tapButton(weapon, FIRE, config)
    tapButton(weapon, RELOAD, config)
    runTicks(weapon, IDLE_WEAPON_INPUT, ticksFor(config.weapon.reloadS, config) - 3, config)
    expect(weapon.roundsInMagazine).toBe(config.weapon.magazineRounds - 1)
    runTicks(weapon, IDLE_WEAPON_INPUT, 4, config)
    expect(weapon.roundsInMagazine).toBe(config.weapon.magazineRounds)
  })

  /** Recarregar cedo não pode ser punido: munição não é recurso. */
  it('atirar com bala no pente cancela a recarga em curso', () => {
    const weapon = armedWeapon(config)
    tapButton(weapon, FIRE, config)
    runTicks(weapon, IDLE_WEAPON_INPUT, ticksFor(config.weapon.boltCycleS, config) + 1, config)
    tapButton(weapon, RELOAD, config)
    expect(weapon.reloadLeftS).toBeGreaterThan(0)
    tapButton(weapon, FIRE, config)
    expect(weapon.shotsFired).toBe(2)
    expect(weapon.reloadLeftS).toBe(0)
  })

  /** Bater no gatilho por nervosismo não pode estender a própria recarga. */
  it('atirar com o pente vazio não dispara nem reinicia a recarga', () => {
    const weapon = emptyTheMagazine()
    const left = weapon.reloadLeftS
    tapButton(weapon, FIRE, config)
    expect(weapon.shotsFired).toBe(config.weapon.magazineRounds)
    expect(weapon.reloadLeftS).toBeLessThan(left)
    expect(weapon.reloadLeftS).toBeGreaterThan(0)
  })

  it('recarregar com o pente cheio não faz nada', () => {
    const weapon = armedWeapon(config)
    tapButton(weapon, RELOAD, config)
    expect(weapon.reloadLeftS).toBe(0)
  })

  it('a recarga engole o ferrolho, que dura menos que ela', () => {
    const weapon = armedWeapon(config)
    tapButton(weapon, FIRE, config)
    expect(weapon.boltLeftS).toBeGreaterThan(0)
    tapButton(weapon, RELOAD, config)
    expect(weapon.boltLeftS).toBe(0)
  })
})

describe('stepWeapon: mira', () => {
  it('o botão direito abre a mira', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, SCOPE, config, dtS)
    expect(weapon.scoped).toBe(true)
  })

  /**
   * Interruptor e não botão preso: num ferrolho a mira fica aberta entre tiros,
   * e segurar o botão a partida inteira é um dedo travado.
   */
  it('soltar o botão direito não fecha a mira', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, SCOPE, config, dtS)
    runTicks(weapon, IDLE_WEAPON_INPUT, 30, config)
    expect(weapon.scoped).toBe(true)
  })

  it('um segundo clique fecha a mira', () => {
    const weapon = armedWeapon(config)
    tapButton(weapon, SCOPE, config)
    expect(weapon.scoped).toBe(true)
    tapButton(weapon, SCOPE, config)
    expect(weapon.scoped).toBe(false)
  })

  /** O pedido do jogador: atirar fecha o scope, estilo counter-strike. */
  it('o disparo fecha a mira, e o botão direito preso não a reabre', () => {
    const weapon = armedWeapon(config)
    runTicks(weapon, SCOPE, 10, config)
    runTicks(weapon, { ...SCOPE, fire: true }, 30, config)
    expect(weapon.shotsFired).toBe(1)
    expect(weapon.scoped).toBe(false)
  })

  /** Depois do tiro, um clique novo volta a mirar — e não dois. */
  it('um clique depois do disparo reabre a mira', () => {
    const weapon = armedWeapon(config)
    tapButton(weapon, SCOPE, config)
    tapButton(weapon, FIRE, config)
    expect(weapon.scoped).toBe(false)
    tapButton(weapon, SCOPE, config)
    expect(weapon.scoped).toBe(true)
  })

  it('o disparo só é exato depois do tempo de assentamento', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, SCOPE, config, dtS)
    expect(isExactShot(weapon, config)).toBe(false)
    runTicks(weapon, SCOPE, ticksFor(config.weapon.scopeSettleS, config) + 1, config)
    expect(isExactShot(weapon, config)).toBe(true)
  })

  it('sem mira o disparo nunca é exato', () => {
    const weapon = runTicks(armedWeapon(config), IDLE_WEAPON_INPUT, 60, config)
    expect(isExactShot(weapon, config)).toBe(false)
  })
})

describe('weaponPhase', () => {
  it('parada, a arma está pronta', () => {
    expect(weaponPhase(armedWeapon(config))).toBe('ready')
  })

  it('o tick do tiro é o do disparo, e o seguinte é o do ferrolho', () => {
    const weapon = armedWeapon(config)
    stepWeapon(weapon, FIRE, config, dtS)
    expect(weaponPhase(weapon)).toBe('firing')
    stepWeapon(weapon, IDLE_WEAPON_INPUT, config, dtS)
    expect(weaponPhase(weapon)).toBe('cycling')
  })

  it('a recarga ganha do ferrolho, porque o engole', () => {
    const weapon = armedWeapon(config)
    tapButton(weapon, FIRE, config)
    tapButton(weapon, RELOAD, config)
    expect(weaponPhase(weapon)).toBe('reloading')
  })
})

describe('a arma e o corpo', () => {
  /**
   * A regra do GDD: o ferrolho é o custo de errar, e **não** tira a
   * movimentação do jogador. Ela é estruturalmente verdadeira porque
   * `stepWeapon` não recebe o corpo — este teste é o que prende isso.
   */
  it('cem ticks de arma não mexem em nada do personagem', () => {
    const character = createCharacterState({ x: 0, y: 0, z: 0 }, config)
    const before = JSON.stringify(character)
    runTicks(armedWeapon(config), { fire: true, scope: true, reload: true }, 100, config)
    expect(JSON.stringify(character)).toBe(before)
  })
})

/**
 * O próprio disparo fecha a mira, então quem resolve o tiro **depois** do tick
 * leria `scoped` já falso e trataria todo tiro com luneta como no scope — o
 * tiro sairia com o cone de dispersão do quadril. Estes dois campos são o
 * registro do instante do disparo.
 */
describe('o instante do disparo', () => {
  it('registra que a mira estava aberta, mesmo tendo fechado no mesmo tick', () => {
    const weapon = armedWeapon(config)
    runTicks(weapon, SCOPE, ticksFor(config.weapon.scopeSettleS, config) + 2, config)
    runTicks(weapon, { ...SCOPE, fire: true }, 1, config)
    expect(weapon.scoped).toBe(false)
    expect(weapon.firedScoped).toBe(true)
    expect(weapon.firedExact).toBe(true)
  })

  it('o tiro de quadril não é exato', () => {
    const weapon = armedWeapon(config)
    runTicks(weapon, FIRE, 1, config)
    expect(weapon.firedScoped).toBe(false)
    expect(weapon.firedExact).toBe(false)
  })

  it('o tiro com a mira recém-aberta ainda não é exato', () => {
    const weapon = armedWeapon(config)
    runTicks(weapon, SCOPE, 1, config)
    runTicks(weapon, { ...SCOPE, fire: true }, 1, config)
    expect(weapon.firedScoped).toBe(true)
    expect(weapon.firedExact).toBe(false)
  })
})
