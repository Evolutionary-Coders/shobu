import { readFileSync } from 'node:fs'
import {
  addPlayer,
  boxFromCenterSize,
  type PlayArea,
  parseGameplayConfig,
  type ShotHit,
  type StaticBox,
  type Vector3,
  type WeaponState,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  type ArenaFrame,
  type ArenaSession,
  createArenaSession,
  LOCAL_PLAYER_ID,
} from './arenaSession.ts'
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
/** Folgada em volta do spawn: os testes de tiro nunca chegam perto da borda. */
const WIDE_AREA: PlayArea = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }
/** Uma área que não contém o spawn: o jogador nasce já fora dela. */
const AREA_EAST: PlayArea = { minX: 10, maxX: 30, minZ: -10, maxZ: 10 }
const RESPAWN_INSIDE = { x: 20, y: 0, z: 0 }

interface BoundaryRig {
  readonly playArea?: PlayArea
  readonly respawnFeetM?: readonly Readonly<Vector3>[]
}

interface Rig {
  readonly session: ArenaSession
  readonly weaponInput: MutableWeaponInput
  readonly movementInput: MutableMovementInput
  frame(over?: Partial<ArenaFrame>): number
}

function mountSession(boxes: readonly StaticBox[] = [FLOOR], boundary: BoundaryRig = {}): Rig {
  const weaponInput = createWeaponInput()
  const movementInput = createMovementInput()
  const session = createArenaSession({
    config,
    character: createLocalCharacter(config, SPAWN_FEET, boxes),
    boxes,
    dummyPostsM: [DUMMY_POST],
    movementInput,
    weaponInput,
    playArea: boundary.playArea ?? WIDE_AREA,
    respawnFeetM: boundary.respawnFeetM ?? [SPAWN_FEET],
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

/**
 * As medalhas do quadro do tiro, copiadas. `lastMedals` é reaproveitado e o
 * quadro seguinte já o esvaziou — o mesmo contrato do `lastShot`.
 */
function pullTriggerForMedals(rig: Rig): readonly string[] {
  rig.weaponInput.fire = true
  rig.frame()
  const slugs = rig.session.lastMedals.map((award) => award.medal.slug)
  rig.weaponInput.fire = false
  rig.frame()
  return slugs
}

/** Os pontos de medalha do quadro do tiro, pela mesma razão. */
function pullTriggerForBonus(rig: Rig): number {
  rig.weaponInput.fire = true
  rig.frame()
  const bonus = rig.session.lastMedals.reduce((sum, award) => sum + award.points, 0)
  rig.weaponInput.fire = false
  rig.frame()
  return bonus
}

describe('restartMatch', () => {
  /**
   * O relógio anda desde o primeiro quadro renderizado, que é o boot: sem o
   * zeramento, quem fica cinco minutos no menu entra numa partida encerrada.
   */
  it('zera o relógio da partida sem zerar o placar', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.matchTimeS).toBeGreaterThan(0)
    const kills = rig.session.scoreboard.kills
    rig.session.restartMatch()
    expect(rig.session.matchTimeS).toBe(0)
    expect(rig.session.scoreboard.kills).toBe(kills)
  })

  it('o relógio volta a andar depois de zerado', () => {
    const rig = mountSession()
    rig.frame()
    rig.session.restartMatch()
    rig.frame()
    expect(rig.session.matchTimeS).toBeGreaterThan(0)
  })
})

describe('createArenaSession', () => {
  it('um tiro na direção do boneco mata o boneco e pontua', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.dummies[0]?.alive).toBe(false)
    expect(rig.session.scoreboard.players.get('local')?.points).toBeGreaterThanOrEqual(
      config.match.pointsPerKill,
    )
  })

  it('a kill concede medalha, e o placar soma o bônus por cima dos pontos dela', () => {
    const rig = mountSession()
    settleScope(rig)
    const bonus = pullTriggerForBonus(rig)
    expect(bonus).toBeGreaterThan(0)
    expect(rig.session.scoreboard.players.get('local')?.points).toBe(
      config.match.pointsPerKill + bonus,
    )
  })

  /**
   * O boneco fica de pé no poste e o olho mira a altura do olho dele, então
   * todo tiro que acerta é `headshot`. É o campo novo do evento de kill
   * chegando de fato da resolução de acerto, e não um zero de placeholder.
   */
  it('o tiro no alto da cápsula chega ao evento como headshot', () => {
    const rig = mountSession()
    settleScope(rig)
    expect(pullTriggerForMedals(rig)).toContain('headshot')
  })

  it('a primeira kill da partida é first blood, e a segunda não', () => {
    const rig = mountSession()
    settleScope(rig)
    expect(pullTriggerForMedals(rig)).toContain('first-blood')
    settleScope(rig)
    expect(pullTriggerForMedals(rig)).not.toContain('first-blood')
  })

  it('o quadro sem kill não deixa medalha do quadro anterior para trás', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    rig.frame()
    expect(rig.session.lastMedals).toEqual([])
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

/** Quadros até o prazo fora da área vencer, com a folga do acumulador de tick. */
const GRACE_FRAMES = Math.ceil(config.match.outOfBoundsGraceS / FRAME_S)

function runFrames(rig: Rig, frames: number): void {
  for (let frame = 0; frame < frames; frame += 1) rig.frame()
}

describe('limite da área de jogo', () => {
  it('dentro da área não há contagem', () => {
    const rig = mountSession()
    runFrames(rig, 10)
    expect(rig.session.boundaryRemainingS).toBeNull()
    expect(rig.session.boundaryDeaths).toBe(0)
  })

  it('fora da área a contagem começa no prazo da configuração e desce', () => {
    const rig = mountSession([FLOOR], { playArea: AREA_EAST, respawnFeetM: [RESPAWN_INSIDE] })
    rig.frame()
    const first = rig.session.boundaryRemainingS ?? Number.NaN
    expect(first).toBeCloseTo(config.match.outOfBoundsGraceS - FRAME_S)
    runFrames(rig, 30)
    expect(rig.session.boundaryRemainingS ?? Number.NaN).toBeCloseTo(first - 30 * FRAME_S)
  })

  it('ainda não mata antes do prazo', () => {
    const rig = mountSession([FLOOR], { playArea: AREA_EAST, respawnFeetM: [RESPAWN_INSIDE] })
    runFrames(rig, GRACE_FRAMES - 2)
    expect(rig.session.boundaryDeaths).toBe(0)
    expect(rig.session.boundaryRemainingS).toBeGreaterThan(0)
  })

  it('vencido o prazo, o jogador morre e reaparece no spawn, já sem contagem', () => {
    const rig = mountSession([FLOOR], { playArea: AREA_EAST, respawnFeetM: [RESPAWN_INSIDE] })
    runFrames(rig, GRACE_FRAMES + 2)
    expect(rig.session.boundaryDeaths).toBe(1)
    expect(rig.session.character.current.position.x).toBeCloseTo(RESPAWN_INSIDE.x)
    expect(rig.session.character.current.position.z).toBeCloseTo(RESPAWN_INSIDE.z)
    expect(rig.session.boundaryRemainingS).toBeNull()
  })

  /**
   * Os dois spawns ficam fora da área de propósito: o jogador morre de novo a
   * cada prazo, e a ordem em que ele reaparece é o rodízio.
   */
  it('reaparece nos spawns em rodízio pelo número de mortes', () => {
    const first = { x: -5, y: 0, z: 0 }
    const second = { x: 0, y: 0, z: -5 }
    const rig = mountSession([FLOOR], { playArea: AREA_EAST, respawnFeetM: [first, second] })
    const visited: number[] = []
    for (let death = 1; death <= 3; death += 1) {
      for (
        let frame = 0;
        rig.session.boundaryDeaths < death && frame < GRACE_FRAMES + 5;
        frame += 1
      ) {
        rig.frame()
      }
      visited.push(rig.session.character.current.position.x)
    }
    expect(rig.session.boundaryDeaths).toBe(3)
    expect(visited).toEqual([first.x, second.x, first.x])
  })

  /** Revisão do PR #16: fugir pela borda guardava a sequência e a luneta. */
  it('a morte pelo limite conta no placar, zera a sequência e rearma a arma', () => {
    const rig = mountSession([FLOOR], { playArea: AREA_EAST, respawnFeetM: [RESPAWN_INSIDE] })
    const local = addPlayer(rig.session.scoreboard, LOCAL_PLAYER_ID)
    local.streak = 4
    // a sessão expõe a arma só para leitura; o teste a põe no estado de antes da morte.
    const weapon = rig.session.weapon as WeaponState
    weapon.scoped = true
    weapon.roundsInMagazine = 1
    runFrames(rig, GRACE_FRAMES + 2)
    expect([local.deaths, local.streak]).toEqual([1, 0])
    expect(rig.session.weapon.scoped).toBe(false)
    expect(rig.session.weapon.roundsInMagazine).toBe(config.weapon.magazineRounds)
  })

  it('a partida nova não herda a contagem fora da área', () => {
    const rig = mountSession([FLOOR], { playArea: AREA_EAST, respawnFeetM: [RESPAWN_INSIDE] })
    runFrames(rig, 30)
    rig.session.restartMatch()
    expect(rig.session.boundaryRemainingS).toBeNull()
    rig.frame()
    expect(rig.session.boundaryRemainingS ?? Number.NaN).toBeCloseTo(
      config.match.outOfBoundsGraceS - FRAME_S,
    )
  })

  it('recusa lista de spawns vazia', () => {
    expect(() => mountSession([FLOOR], { respawnFeetM: [] })).toThrow(/respawnFeetM recebeu \[\]/)
  })
})

describe('gancho na sessão', () => {
  /** Uma parede 30 m à frente, atrás do boneco: dentro do alcance do gancho. */
  const WALL: StaticBox = boxFromCenterSize([0, 10, 30.5], [40, 20, 1])

  it('a mira do quadro é para onde o gancho dispara', () => {
    const rig = mountSession([FLOOR, WALL])
    rig.movementInput.grapple = true
    rig.frame({ aimM: { x: 0, y: 0.2, z: 1 } })
    const { current } = rig.session.character
    expect(current.grappleAttached).toBe(true)
    expect(current.grappleAnchor.z).toBeCloseTo(30)
  })

  it('a retícula sabe, antes do aperto, se há onde prender', () => {
    const rig = mountSession([FLOOR, WALL])
    rig.frame()
    expect(rig.session.grappleInReach).toBe(true)
    rig.frame({ aimM: { x: 0, y: 0, z: -1 } })
    expect(rig.session.grappleInReach).toBe(false)
  })

  it('engatado ou em recarga, a retícula não promete gancho', () => {
    const rig = mountSession([FLOOR, WALL])
    rig.movementInput.grapple = true
    rig.frame()
    expect(rig.session.grappleInReach).toBe(false)
    rig.movementInput.grapple = false
    rig.frame()
    expect(rig.session.character.current.grappleCooldownLeftS).toBeGreaterThan(0)
    expect(rig.session.grappleInReach).toBe(false)
  })

  it('a kill com a corda presa ganha a na-corda', () => {
    const rig = mountSession([FLOOR, WALL])
    settleScope(rig)
    rig.movementInput.grapple = true
    rig.frame()
    expect(pullTriggerForMedals(rig)).toContain('on-the-rope')
  })

  it('a kill com o pé no chão não ganha a na-corda', () => {
    const rig = mountSession([FLOOR, WALL])
    settleScope(rig)
    expect(pullTriggerForMedals(rig)).not.toContain('on-the-rope')
  })
})
