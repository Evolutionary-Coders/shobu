import { describe, expect, it } from 'vitest'
import { createBotPlayer, resetBotBody } from './botPlayer.ts'
import { config, GRAPH } from './botTestKit.ts'

function bot() {
  return createBotPlayer(
    { id: 'bot-2', callsign: 'VOLT', seed: 3 },
    { x: 1, y: 0, z: 2 },
    GRAPH,
    config,
  )
}

describe('createBotPlayer', () => {
  it('nasce vivo, no pé pedido, de arma cheia e sem alvo', () => {
    const created = bot()
    expect(created).toMatchObject({ id: 'bot-2', callsign: 'VOLT', alive: true, respawnLeftS: 0 })
    expect(created.body.position).toEqual({ x: 1, y: 0, z: 2 })
    expect(created.weapon.roundsInMagazine).toBe(config.weapon.magazineRounds)
    expect(created.mind.targetIndex).toBe(-1)
  })

  /** O corpo do tick anterior é outro objeto: o render interpola entre os dois. */
  it('o corpo anterior é outro objeto, na mesma posição', () => {
    const created = bot()
    expect(created.previousBody).not.toBe(created.body)
    expect(created.previousBody.position).toEqual(created.body.position)
  })
})

describe('resetBotBody', () => {
  it('põe os dois corpos no pé novo, rearma a arma e esquece o alvo', () => {
    const created = bot()
    created.body.velocity.x = 7
    created.weapon.roundsInMagazine = 1
    created.weapon.shotsFired = 9
    created.mind.targetIndex = 2
    created.weaponInput.fire = true
    created.movementInput.wishX = 1
    resetBotBody(created, { x: 5, y: 4.5, z: 5 }, config)
    expect(created.body.position).toEqual({ x: 5, y: 4.5, z: 5 })
    expect(created.previousBody.position).toEqual({ x: 5, y: 4.5, z: 5 })
    expect(created.body.velocity.x).toBe(0)
    expect(created.weapon.roundsInMagazine).toBe(config.weapon.magazineRounds)
    // a identidade do tiro sobrevive ao respawn (`rearmWeapon`).
    expect(created.weapon.shotsFired).toBe(9)
    expect([
      created.mind.targetIndex,
      created.weaponInput.fire,
      created.movementInput.wishX,
    ]).toEqual([-1, false, 0])
  })
  /** Revisão do núcleo: a tecla presa na morte disparava gancho, pulo ou corrida no tick do respawn. */
  it('as teclas do corpo presas atravessam a morte, e não disparam de novo ao nascer', () => {
    const created = bot()
    Object.assign(created.body, {
      jumpWasHeld: true,
      crouchWasHeld: true,
      grappleWasHeld: true,
      sprintWasHeld: true,
    })
    resetBotBody(created, { x: 5, y: 4.5, z: 5 }, config)
    for (const body of [created.body, created.previousBody]) {
      expect(body).toMatchObject({
        jumpWasHeld: true,
        crouchWasHeld: true,
        grappleWasHeld: true,
        sprintWasHeld: true,
      })
    }
  })
})
