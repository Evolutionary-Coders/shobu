import { describe, expect, it } from 'vitest'
import type { Fighter } from '../match/fighter.ts'
import { eyeOf } from '../match/fighter.ts'
import {
  aimAlongStride,
  aimAtFoe,
  aimErrorTangent,
  botAimTangents,
  pullTriggers,
} from './botAim.ts'
import { type BotPlayer, createBotPlayer } from './botPlayer.ts'
import { config, GRAPH, standingFighter } from './botTestKit.ts'

const TANGENTS = botAimTangents(config.bots)

function botAt(z: number): BotPlayer {
  const bot = createBotPlayer(
    { id: 'bot-0', callsign: 'ONRYO', seed: 1 },
    { x: 0, y: 0, z },
    GRAPH,
    config,
  )
  bot.body.grounded = true
  eyeOf(bot.body, bot.eyeM)
  return bot
}

describe('aimErrorTangent', () => {
  it('começa no erro de chegada e desce em linha reta até o residual', () => {
    const { aimSettleS } = config.bots
    expect(aimErrorTangent(0, TANGENTS, config.bots)).toBeCloseTo(TANGENTS.arrival)
    expect(aimErrorTangent(aimSettleS / 2, TANGENTS, config.bots)).toBeCloseTo(
      (TANGENTS.arrival + TANGENTS.residual) / 2,
    )
    expect(aimErrorTangent(aimSettleS * 3, TANGENTS, config.bots)).toBeCloseTo(TANGENTS.residual)
  })

  it('o erro de chegada é maior que o residual, como a configuração pede', () => {
    expect(TANGENTS.arrival).toBeGreaterThan(TANGENTS.residual)
  })
})

describe('aimAtFoe', () => {
  it('sem erro, mira reto no peito e devolve a distância', () => {
    const bot = botAt(-20)
    const foe = standingFighter('local', { x: 0, y: 0, z: 20 })
    const distanceM = aimAtFoe(bot, foe, { arrival: 0, residual: 0 }, config.bots)
    expect(distanceM).toBeCloseTo(40, 0)
    expect(bot.aimM.z).toBeCloseTo(1, 3)
  })

  /** O mesmo ângulo de erro de perto e de longe: o desvio cresce com a distância. */
  it('o erro desvia a mira no ângulo da tangente, a qualquer distância', () => {
    const bot = botAt(-20)
    bot.mind.aimJitter.x = 1
    const foe = standingFighter('local', { x: 0, y: 0, z: 20 })
    aimAtFoe(bot, foe, { arrival: 0.1, residual: 0.1 }, config.bots)
    expect(bot.aimM.x / bot.aimM.z).toBeCloseTo(0.1, 2)
  })
})

describe('aimAlongStride', () => {
  it('sem alvo, olha para onde anda, no plano', () => {
    const bot = botAt(0)
    bot.movementInput.wishX = 3
    bot.movementInput.wishZ = 4
    aimAlongStride(bot)
    expect([bot.aimM.x, bot.aimM.y, bot.aimM.z].map((value) => value.toFixed(6))).toEqual([
      '0.600000',
      '0.000000',
      '0.800000',
    ])
  })

  it('parado, continua olhando para onde olhava', () => {
    const bot = botAt(0)
    bot.aimM.x = 1
    bot.aimM.z = 0
    aimAlongStride(bot)
    expect(bot.aimM).toEqual({ x: 1, y: 0, z: 0 })
  })
})

describe('pullTriggers', () => {
  const NEAR_M = config.bots.scopeBeyondM - 1
  const FAR_M = config.bots.scopeBeyondM + 1

  function readyBot(): BotPlayer {
    const bot = botAt(0)
    bot.mind.targetSeenS = config.bots.reactionS
    return bot
  }

  it('de perto, depois da reação, atira sem luneta', () => {
    const bot = readyBot()
    pullTriggers(bot, { distanceM: NEAR_M, hostile: true }, config)
    expect(bot.weaponInput).toEqual({ fire: true, scope: false, reload: false })
  })

  it('antes do tempo de reação, não atira', () => {
    const bot = readyBot()
    bot.mind.targetSeenS = 0
    pullTriggers(bot, { distanceM: NEAR_M, hostile: true }, config)
    expect(bot.weaponInput.fire).toBe(false)
  })

  it('de longe, abre a luneta primeiro e só atira com ela assentada', () => {
    const bot = readyBot()
    pullTriggers(bot, { distanceM: FAR_M, hostile: true }, config)
    expect(bot.weaponInput).toEqual({ fire: false, scope: true, reload: false })
    bot.weapon.scoped = true
    bot.weapon.scopeWasHeld = true
    pullTriggers(bot, { distanceM: FAR_M, hostile: true }, config)
    expect(bot.weaponInput).toEqual({ fire: false, scope: false, reload: false })
    bot.weapon.scopedForS = config.weapon.scopeSettleS
    pullTriggers(bot, { distanceM: FAR_M, hostile: true }, config)
    expect(bot.weaponInput.fire).toBe(true)
  })

  it('de perto com a luneta aberta, fecha antes de atirar', () => {
    const bot = readyBot()
    bot.weapon.scoped = true
    pullTriggers(bot, { distanceM: NEAR_M, hostile: true }, config)
    expect(bot.weaponInput).toEqual({ fire: false, scope: true, reload: false })
  })

  /** O gatilho é borda: preso no tick anterior, não dispara de novo. */
  it('com o gatilho ainda preso do tick anterior, solta', () => {
    const bot = readyBot()
    bot.weapon.fireWasHeld = true
    pullTriggers(bot, { distanceM: NEAR_M, hostile: true }, config)
    expect(bot.weaponInput.fire).toBe(false)
  })

  it('com o ferrolho correndo, espera', () => {
    const bot = readyBot()
    bot.weapon.boltLeftS = 0.5
    pullTriggers(bot, { distanceM: NEAR_M, hostile: true }, config)
    expect(bot.weaponInput.fire).toBe(false)
  })

  it('sem alvo e com o pente incompleto, recarrega; cheio ou já recarregando, não', () => {
    const bot = readyBot()
    pullTriggers(bot, { distanceM: Number.POSITIVE_INFINITY, hostile: true }, config)
    expect(bot.weaponInput.reload).toBe(false)
    bot.weapon.roundsInMagazine = 2
    pullTriggers(bot, { distanceM: Number.POSITIVE_INFINITY, hostile: true }, config)
    expect(bot.weaponInput.reload).toBe(true)
    bot.weapon.reloadLeftS = 1
    pullTriggers(bot, { distanceM: Number.POSITIVE_INFINITY, hostile: true }, config)
    expect(bot.weaponInput.reload).toBe(false)
  })

  /** No treino o bot é alvo: vê, mas não aperta nada. */
  it('fora do modo hostil, não atira nem abre luneta', () => {
    const bot = readyBot()
    pullTriggers(bot, { distanceM: FAR_M, hostile: false }, config)
    expect([bot.weaponInput.fire, bot.weaponInput.scope]).toEqual([false, false])
  })
})

describe('o foe dos testes', () => {
  it('é um combatente vivo apoiado no chão', () => {
    const foe: Fighter = standingFighter('local', { x: 0, y: 0, z: 20 })
    expect([foe.alive, foe.body.grounded]).toEqual([true, true])
  })
})
