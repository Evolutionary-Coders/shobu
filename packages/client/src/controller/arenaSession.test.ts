import { addPlayer, boxFromCenterSize, type StaticBox, type WeaponState } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createArenaSession, LOCAL_PLAYER_ID } from './arenaSession.ts'
import {
  AREA_EAST,
  BOT_POST,
  config,
  FLOOR,
  FRAME_S,
  mountSession,
  OUTSIDE_EAST,
  POST_GRAPH,
  pullTrigger,
  pullTriggerForBonus,
  pullTriggerForMedals,
  RESPAWN_INSIDE,
  type Rig,
  ROOM_RULES,
  SPAWN_FEET,
  settleScope,
  WIDE_AREA,
} from './arenaSessionTestKit.ts'
import { createLocalCharacter } from './localCharacter.ts'
import { createWeaponInput } from './weaponInputFrom.ts'
import { createMovementInput } from './wishDirection.ts'

describe('createArenaSession', () => {
  it('um tiro na direção do bot mata o bot e pontua', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.bots[0]?.alive).toBe(false)
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
   * O bot fica de pé no posto e o olho mira a altura do olho dele, então
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

  it('uma parede na frente do bot não deixa ninguém morrer', () => {
    const wall = boxFromCenterSize([0, 5, 10], [20, 10, 1])
    const rig = mountSession([FLOOR, wall])
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.bots[0]?.alive).toBe(true)
    expect(rig.session.scoreboard.kills).toBe(0)
  })

  it('o rastro do tiro termina na parede', () => {
    const wall = boxFromCenterSize([0, 5, 10], [20, 10, 1])
    const rig = mountSession([FLOOR, wall])
    settleScope(rig)
    expect(pullTrigger(rig)?.distanceM).toBeCloseTo(9.5, 1)
  })

  it('o bot morto volta depois do atraso de respawn e pode morrer de novo', () => {
    const rig = mountSession()
    settleScope(rig)
    pullTrigger(rig)
    const respawnFrames = Math.ceil(config.match.respawnDelayS / FRAME_S) + 2
    for (let frame = 0; frame < respawnFrames; frame += 1) rig.frame()
    expect(rig.session.bots[0]?.alive).toBe(true)
    // o ferrolho do primeiro tiro já correu durante a espera do respawn.
    settleScope(rig)
    pullTrigger(rig)
    expect(rig.session.bots[0]?.alive).toBe(false)
    expect(rig.session.scoreboard.kills).toBe(2)
  })

  /** O tiro vale só no quadro dele: guardar o ponteiro é erro de quem guarda. */
  it('o tiro do quadro some no quadro seguinte', () => {
    const rig = mountSession()
    // a partida nova pede um aperto novo (`rearmWeapon`): o quadro solto vem antes.
    rig.frame()
    expect(pullTrigger(rig)).toBeDefined()
    expect(rig.session.lastShot).toBeUndefined()
  })

  /**
   * A ordem dentro do tick: a arma anda antes do corpo, então a mira aberta
   * vale para a movimentação no **mesmo** tick, não no seguinte.
   */
  it('a mira lenta vale no mesmo tick em que a mira abre', () => {
    const rig = mountSession()
    // a partida nova pede um aperto novo (`rearmWeapon`): o quadro solto vem antes.
    rig.frame()
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
    // a partida nova pede um aperto novo (`rearmWeapon`): o quadro solto vem antes.
    rig.frame()
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
    const rig = mountSession([FLOOR], OUTSIDE_EAST)
    rig.frame()
    const first = rig.session.boundaryRemainingS ?? Number.NaN
    expect(first).toBeCloseTo(config.match.outOfBoundsGraceS - FRAME_S)
    runFrames(rig, 30)
    expect(rig.session.boundaryRemainingS ?? Number.NaN).toBeCloseTo(first - 30 * FRAME_S)
  })

  it('ainda não mata antes do prazo', () => {
    const rig = mountSession([FLOOR], OUTSIDE_EAST)
    runFrames(rig, GRACE_FRAMES - 2)
    expect(rig.session.boundaryDeaths).toBe(0)
    expect(rig.session.boundaryRemainingS).toBeGreaterThan(0)
  })

  it('vencido o prazo, o jogador morre e reaparece no spawn, já sem contagem', () => {
    const rig = mountSession([FLOOR], OUTSIDE_EAST)
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
    const rig = mountSession([FLOOR], OUTSIDE_EAST)
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
    const rig = mountSession([FLOOR], OUTSIDE_EAST)
    runFrames(rig, 30)
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: false })
    expect(rig.session.boundaryRemainingS).toBeNull()
    // a partida nova o põe no spawn, dentro da área: o teste o leva de volta para fora.
    rig.session.character.respawnAt(SPAWN_FEET)
    rig.frame()
    expect(rig.session.boundaryRemainingS ?? Number.NaN).toBeCloseTo(
      config.match.outOfBoundsGraceS - FRAME_S,
    )
  })

  it('recusa lista de spawns vazia', () => {
    expect(() => mountSession([FLOOR], { respawnFeetM: [] })).toThrow(/respawnFeetM recebeu \[\]/)
  })
})

/** Quadros até um bot hostil, de frente para o jogador a 20 m, acertá-lo — com folga. */
const DUEL_FRAMES = Math.ceil(10 / FRAME_S)

/** Roda até o jogador local morrer, ou o prazo vencer. Devolve o quadro da morte, ou -1. */
function runUntilLocalDies(rig: Rig): number {
  for (let frame = 0; frame < DUEL_FRAMES; frame += 1) {
    rig.frame()
    if (!rig.session.local.alive) return frame
  }
  return -1
}

describe('os bots completam a sala', () => {
  /** A regra de `botSeatsFor`: vagas que os humanos não ocuparam. */
  it('o jogador sozinho divide a sala com três bots', () => {
    const rig = mountSession([FLOOR], { humans: 1 })
    expect(rig.session.bots).toHaveLength(config.match.playersPerRoom - 1)
    expect(rig.session.fighters.map((fighter) => fighter.id)).toEqual([
      'local',
      'bot-0',
      'bot-1',
      'bot-2',
    ])
  })

  it('sem dizer quantos humanos, conta só o jogador local', () => {
    const session = createArenaSession({
      config,
      character: createLocalCharacter(config, SPAWN_FEET, [FLOOR]),
      boxes: [FLOOR],
      navGraph: POST_GRAPH,
      movementInput: createMovementInput(),
      weaponInput: createWeaponInput(),
      playArea: WIDE_AREA,
      respawnFeetM: [SPAWN_FEET, BOT_POST],
    })
    expect(session.bots).toHaveLength(config.match.playersPerRoom - 1)
  })

  /** O tab mostra a sala inteira antes da primeira kill, na ordem de entrada. */
  it('todo mundo entra no placar em zero, o jogador primeiro', () => {
    const { session } = mountSession([FLOOR], { humans: 1 })
    expect([...session.scoreboard.players.keys()]).toEqual(['local', 'bot-0', 'bot-1', 'bot-2'])
    expect([...session.scoreboard.players.values()].every((score) => score.points === 0)).toBe(true)
  })

  it('a sala cheia de humanos não tem bot', () => {
    expect(mountSession([FLOOR], { humans: config.match.playersPerRoom }).session.bots).toEqual([])
  })

  it('o jogador é AGENTE sem nome, o bot é o apelido, e id desconhecido sai em caixa alta', () => {
    const { session } = mountSession()
    const bot = session.bots[0]
    expect(session.nameOf('local')).toBe('AGENTE')
    expect(session.nameOf(bot?.id ?? '')).toBe(bot?.callsign)
    expect(session.nameOf('sala-7')).toBe('SALA-7')
  })

  it('o treino deixa o bot manso, e a partida o deixa hostil', () => {
    const rig = mountSession()
    expect(runUntilLocalDies(rig)).toBe(-1)
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: true })
    expect(runUntilLocalDies(rig)).toBeGreaterThanOrEqual(0)
  })
})

describe('o jogador morre para um bot', () => {
  it('o bot atira, o rastro sai dele, e a kill dele vai para o registro do quadro', () => {
    const rig = mountSession([FLOOR], { hostileBots: true })
    let tracers = 0
    for (let frame = 0; frame < DUEL_FRAMES && rig.session.local.alive; frame += 1) {
      rig.frame()
      tracers += rig.session.lastBotShots.count
    }
    expect(tracers).toBeGreaterThan(0)
    expect(rig.session.lastKills.count).toBe(1)
    expect(rig.session.lastKills.slots[0]).toMatchObject({
      shooterId: 'bot-0',
      victimId: 'local',
      weapon: 'sniper',
    })
    expect(rig.session.lastBotShots.slots[0]?.fromM.z).toBeCloseTo(BOT_POST.z, 0)
  })

  it('o rastro do tiro que matou diz que achou um combatente, para o impacto ser o do corpo', () => {
    const rig = mountSession([FLOOR], { hostileBots: true })
    let killingTracer: boolean | undefined
    for (let frame = 0; frame < DUEL_FRAMES && rig.session.local.alive; frame += 1) {
      rig.frame()
      if (rig.session.lastKills.count > 0)
        killingTracer = rig.session.lastBotShots.slots[0]?.hitFighter
    }
    expect(killingTracer).toBe(true)
  })

  /**
   * A 80 m, o erro que sobra na mira do bot passa de meio corpo: ele erra, e o
   * tiro que erra também deixa rastro — é a única pista de onde ele veio.
   */
  it('de longe o bot também erra, e o tiro errado deixa rastro sem kill', () => {
    const rig = mountSession([FLOOR], {
      hostileBots: true,
      respawnFeetM: [SPAWN_FEET, { x: 0, y: 0, z: 80 }],
    })
    let tracers = 0
    let kills = 0
    for (let frame = 0; frame < DUEL_FRAMES; frame += 1) {
      rig.frame({ aimM: { x: 1, y: 0, z: 0 } })
      tracers += rig.session.lastBotShots.count
      kills += rig.session.lastKills.count
    }
    expect(tracers).toBeGreaterThan(kills)
  })

  it('o placar conta a morte do jogador e a kill do bot pelo mesmo caminho', () => {
    const rig = mountSession([FLOOR], { hostileBots: true })
    runUntilLocalDies(rig)
    expect(rig.session.scoreboard.players.get('local')?.deaths).toBe(1)
    expect(rig.session.scoreboard.players.get('bot-0')?.points).toBeGreaterThanOrEqual(
      config.match.pointsPerKill,
    )
    // as medalhas do bot pontuam, mas não são as da tela.
    expect(rig.session.lastMedals).toEqual([])
  })

  it('morto, a sessão diz quem matou, e o registro do quadro seguinte zera', () => {
    const rig = mountSession([FLOOR], { hostileBots: true })
    runUntilLocalDies(rig)
    expect(rig.session.killedBy).toBe('bot-0')
    // a causa é a mesma kill que o placar contou, para a tela de morte.
    expect(rig.session.deathCause).toMatchObject({ shooterId: 'bot-0', victimId: 'local' })
    rig.frame()
    expect([rig.session.lastKills.count, rig.session.lastBotShots.count]).toEqual([0, 0])
  })

  /** A câmera parada na posição da morte (GDD): sem andar e sem atirar. */
  it('morto, o corpo não anda e a arma não atira', () => {
    const rig = mountSession([FLOOR], { hostileBots: true })
    runUntilLocalDies(rig)
    const where = { ...rig.session.character.current.position }
    const shots = rig.session.weapon.shotsFired
    rig.movementInput.wishX = 1
    rig.weaponInput.fire = true
    rig.frame()
    expect(rig.session.character.current.position).toEqual(where)
    expect(rig.session.weapon.shotsFired).toBe(shots)
  })

  it('depois do atraso, volta num spawn, vivo e de arma pronta', () => {
    const rig = mountSession([FLOOR], { hostileBots: true })
    runUntilLocalDies(rig)
    ;(rig.session.weapon as WeaponState).roundsInMagazine = 1
    const respawnFrames = Math.ceil(config.match.respawnDelayS / FRAME_S) + 2
    for (let frame = 0; frame < respawnFrames && !rig.session.local.alive; frame += 1) rig.frame()
    expect(rig.session.local.alive).toBe(true)
    expect(rig.session.killedBy).toBeNull()
    expect(rig.session.weapon.roundsInMagazine).toBe(config.weapon.magazineRounds)
    expect([SPAWN_FEET.z, BOT_POST.z]).toContain(rig.session.character.current.position.z)
  })

  it('a morte apaga o aviso de fora da área', () => {
    const rig = mountSession([FLOOR], {
      hostileBots: true,
      playArea: { minX: 5, maxX: 30, minZ: -10, maxZ: 30 },
    })
    rig.frame()
    expect(rig.session.boundaryRemainingS).not.toBeNull()
    runUntilLocalDies(rig)
    expect(rig.session.boundaryRemainingS).toBeNull()
  })
})

describe('os bots ouvem o tiro', () => {
  /** A 20 m, mirar 5 cm de lado por metro passa o tiro a um metro do peito do bot. */
  const BESIDE_THE_BOT = { x: 0.05, y: 0, z: 1 }

  it('o tiro do jogador que passa perto assusta o bot', () => {
    const rig = mountSession()
    settleScope(rig)
    rig.weaponInput.fire = true
    rig.frame({ aimM: BESIDE_THE_BOT })
    expect(rig.session.lastShot?.targetIndex).toBe(-1)
    expect(rig.session.bots[0]?.mind.flinchLeftS).toBe(config.bots.flinchS)
  })

  it('o tiro para o outro lado não', () => {
    const rig = mountSession()
    settleScope(rig)
    rig.weaponInput.fire = true
    rig.frame({ aimM: { x: 1, y: 0, z: 0 } })
    expect(rig.session.bots[0]?.mind.flinchLeftS).toBe(0)
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
