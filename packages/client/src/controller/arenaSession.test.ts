import { readFileSync } from 'node:fs'
import { boxFromCenterSize, parseGameplayConfig, type ShotHit, type StaticBox } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { type ArenaFrame, type ArenaSession, createArenaSession } from './arenaSession.ts'
import { createLocalCharacter } from './localCharacter.ts'
import { createWeaponInput, type MutableWeaponInput } from './weaponInputFrom.ts'
import { createMovementInput, type MutableMovementInput } from './wishDirection.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

const FLOOR: StaticBox = boxFromCenterSize([0, -0.5, 0], [200, 1, 200])
const SPAWN_FEET = { x: 0, y: 0, z: 0 }
/** Um boneco a 20 m na frente, na convenção de olho dos spawns. */
const DUMMY_POST: readonly [number, number, number] = [0, 1.8, 20]
const FRAME_S = 1 / 60

interface Rig {
  readonly session: ArenaSession
  readonly weaponInput: MutableWeaponInput
  readonly movementInput: MutableMovementInput
  frame(over?: Partial<ArenaFrame>): number
}

function mountSession(boxes: readonly StaticBox[] = [FLOOR]): Rig {
  const weaponInput = createWeaponInput()
  const movementInput = createMovementInput()
  const session = createArenaSession({
    config,
    character: createLocalCharacter(config, SPAWN_FEET, boxes),
    boxes,
    dummyPostsM: [DUMMY_POST],
    movementInput,
    weaponInput,
  })
  return {
    session,
    weaponInput,
    movementInput,
    frame: (over = {}) =>
      session.advance({
        elapsedS: FRAME_S,
        // o olho do jogador, mirando o tronco do boneco lá na frente.
        eyeM: { x: 0, y: 1.656, z: 0 },
        aimM: { x: 0, y: 0, z: 1 },
        ...over,
      }),
  }
}

/**
 * Mira assentada antes de atirar. Com a mira crua o tiro sofre o cone de
 * `noScopeSpreadDeg`, que a 20 m tem raio de 1,6 m contra um alvo de 0,8 m:
 * errar é o resultado comum, e um teste de acerto não pode depender de sorte.
 */
function settleScope(rig: Rig): void {
  // soltar antes: o disparo fecha a mira, e o botão preso não a reabre.
  rig.weaponInput.scope = false
  rig.frame()
  rig.weaponInput.scope = true
  for (let frame = 0; frame < 10; frame += 1) rig.frame()
}

/** Um toque no gatilho. Devolve o tiro do quadro em que ele saiu. */
function pullTrigger(rig: Rig): Readonly<ShotHit> | undefined {
  rig.weaponInput.fire = true
  rig.frame()
  const shot = rig.session.lastShot
  rig.weaponInput.fire = false
  rig.frame()
  return shot
}

describe('createArenaSession', () => {
  it('um tiro na direção do boneco mata o boneco e vale um ponto', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.dummies[0]?.alive).toBe(false)
    expect(rig.session.scoreboard.players.get('local')?.points).toBe(config.match.pointsPerKill)
  })

  it('uma parede na frente do boneco não deixa ninguém morrer', () => {
    const wall = boxFromCenterSize([0, 5, 10], [20, 10, 1])
    const rig = mountSession([FLOOR, wall])
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.dummies[0]?.alive).toBe(true)
    expect(rig.session.scoreboard.kills).toBe(0)
  })

  it('o rastro do tiro termina na parede', () => {
    const wall = boxFromCenterSize([0, 5, 10], [20, 10, 1])
    const rig = mountSession([FLOOR, wall])
    settleScope(rig)
    expect(pullTrigger(rig)?.distanceM).toBeCloseTo(9.5, 1)
  })

  it('o boneco morto volta depois do atraso de respawn e pode morrer de novo', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    const respawnFrames = Math.ceil(config.match.respawnDelayS / FRAME_S) + 2
    for (let frame = 0; frame < respawnFrames; frame += 1) rig.frame()
    expect(rig.session.dummies[0]?.alive).toBe(true)
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.dummies[0]?.alive).toBe(false)
    expect(rig.session.scoreboard.kills).toBe(2)
  })

  /** O tiro vale só no quadro dele: guardar o ponteiro é erro de quem guarda. */
  it('o tiro do quadro some no quadro seguinte', () => {
    const rig = mountSession()
    expect(pullTrigger(rig)).toBeDefined()
    expect(rig.session.lastShot).toBeUndefined()
  })

  /**
   * A ordem dentro do tick: a arma anda antes do corpo, então a mira aberta
   * vale para a movimentação no **mesmo** tick, não no seguinte.
   */
  it('a mira lenta vale no mesmo tick em que a mira abre', () => {
    const rig = mountSession()
    rig.weaponInput.scope = true
    rig.frame()
    expect(rig.movementInput.scoped).toBe(true)
  })

  it('atirar fecha a mira e devolve a velocidade de corrida', () => {
    const rig = mountSession()
    rig.weaponInput.scope = true
    rig.frame()
    rig.weaponInput.fire = true
    rig.frame()
    expect(rig.session.weapon.scoped).toBe(false)
    expect(rig.movementInput.scoped).toBe(false)
  })

  it('a arma e o personagem andam no mesmo relógio', () => {
    const rig = mountSession()
    const ticks = rig.frame({ elapsedS: 5 / 60 })
    expect(ticks).toBe(5)
    expect(rig.session.matchTimeS).toBeCloseTo(5 / 60)
  })

  it('o pente esvazia a cada tiro e recarrega sozinho no último', () => {
    const rig = mountSession()
    for (let shot = 0; shot < config.weapon.magazineRounds; shot += 1) {
      pullTrigger(rig)
      const boltFrames = Math.ceil(config.weapon.boltCycleS / FRAME_S) + 1
      for (let frame = 0; frame < boltFrames; frame += 1) rig.frame()
    }
    expect(rig.session.weapon.roundsInMagazine).toBe(0)
    expect(rig.session.weapon.reloadLeftS).toBeGreaterThan(0)
  })

  /** A reprodução que o servidor vai precisar: mesma entrada, mesmo tiro. */
  it('o mesmo quadro com a mesma semente produz o mesmo tiro', () => {
    const first = mountSession()
    const second = mountSession()
    pullTrigger(first)
    pullTrigger(second)
    expect(first.session.lastShot).toEqual(second.session.lastShot)
  })
})
