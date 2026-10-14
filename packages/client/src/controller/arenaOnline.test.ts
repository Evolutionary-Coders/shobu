import {
  createKillEvent,
  encodeStance,
  isBenched,
  type KillEvent,
  quantizePositionM,
  type ShotMessage,
  type Vector3,
  wishOnWire,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { PlayerSnapshotFields } from '../net/remotePlayerView.ts'
import type { RoomFeed } from './arenaOnline.ts'
import { type ArenaSession, createArenaSession, LOCAL_PLAYER_ID } from './arenaSession.ts'
import {
  config,
  FLOOR,
  FRAME_S,
  ROOM_RULES,
  sessionOptionsFor,
  settleScope,
} from './arenaSessionTestKit.ts'
import { createWeaponInput, type MutableWeaponInput } from './weaponInputFrom.ts'
import { createMovementInput, type MutableMovementInput } from './wishDirection.ts'

/** Um jogador da sala, parado onde o teste quer, vivo, olhando para -z. */
function snapshotAt(feetM: Vector3, alive = true): PlayerSnapshotFields {
  return {
    x: quantizePositionM(feetM.x),
    y: quantizePositionM(feetM.y),
    z: quantizePositionM(feetM.z),
    aimX: 0,
    aimY: 0,
    aimZ: -32767,
    stance: encodeStance('standing', true),
    alive,
    name: 'ANA',
  }
}

/** A sala do servidor, em memória: quem está nela, as mortes e o próximo spawn. */
class FakeRoom implements RoomFeed {
  ownId: string | undefined = 'eu'
  readonly remotes = new Map<string, PlayerSnapshotFields>()
  readonly kills: KillEvent[] = []
  readonly boundaryDeaths: string[] = []
  readonly shots: ShotMessage[] = []
  spawn: Vector3 | undefined = undefined
  readonly callsigns: string[] = []

  chooseCallsign(callsign: string): void {
    this.callsigns.push(callsign)
  }

  forEachRemote(
    _nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void {
    for (const [playerId, fields] of this.remotes) visit(playerId, fields)
  }

  drainKills(visit: (kill: KillEvent) => void): void {
    for (const kill of this.kills.splice(0)) visit(kill)
  }

  drainBoundaryDeaths(visit: (playerId: string) => void): void {
    for (const playerId of this.boundaryDeaths.splice(0)) visit(playerId)
  }

  drainShots(visit: (shot: ShotMessage) => void): void {
    for (const shot of this.shots.splice(0)) visit(shot)
  }

  shoot(shooterId: string, hitFighter = false): void {
    this.shots.push({ shooterId, fromM: AHEAD, toM: { x: 0, y: 1, z: 0 }, hitFighter })
  }

  takeOwnSpawn(): Vector3 | undefined {
    const spawn = this.spawn
    this.spawn = undefined
    return spawn
  }

  kill(shooterId: string, victimId: string, weapon: KillEvent['weapon'] = 'sniper'): void {
    this.kills.push({ ...createKillEvent(), shooterId, victimId, weapon, distanceM: 20 })
  }
}

interface OnlineRig {
  readonly session: ArenaSession
  readonly room: FakeRoom
  readonly weaponInput: MutableWeaponInput
  readonly movementInput: MutableMovementInput
  readonly ticks: { wishX: number; aimX: number }[]
  /** Um quadro: o que a sala mudou, e o avanço da arena. */
  frame(aimM?: Vector3): number
}

/** A sessão dos testes, com a sala ligada: as três vagas de bot viram fantoches. */
function mountOnline(): OnlineRig {
  const weaponInput = createWeaponInput()
  const movementInput = createMovementInput()
  const ticks: { wishX: number; aimX: number }[] = []
  const session = createArenaSession({
    ...sessionOptionsFor([FLOOR], { humans: 1 }, { weaponInput, movementInput }),
    onTick: (movement, _weapon, aimM) => ticks.push({ wishX: movement.wishX, aimX: aimM.x }),
  })
  session.restartMatch({ ...ROOM_RULES, hostileBots: false })
  const room = new FakeRoom()
  const frame = (aimM: Vector3 = { x: 0, y: 0, z: 1 }): number => {
    session.followRoom(room, 0, FRAME_S)
    return session.advance({ elapsedS: FRAME_S, eyeM: { x: 0, y: 1.656, z: 0 }, aimM })
  }
  return { session, room, weaponInput, movementInput, ticks, frame }
}

const AHEAD = { x: 0, y: 0, z: 20 }

describe('followRoom', () => {
  /** Sem servidor, a arena joga sozinha com os bots locais, como sempre jogou. */
  it('sem sala conectada não muda nada, e os bots seguem na arena', () => {
    const rig = mountOnline()
    rig.room.ownId = undefined
    rig.frame()
    expect(rig.session.bots.some((bot) => bot.alive)).toBe(true)
  })

  it('com a sala conectada, as vagas dos bots esvaziam e saem do placar', () => {
    const rig = mountOnline()
    rig.frame()
    expect(rig.session.bots.every(isBenched)).toBe(true)
    expect([...rig.session.scoreboard.players.keys()]).toEqual([LOCAL_PLAYER_ID])
  })

  it('põe cada jogador da sala numa vaga, no lugar e com a mira do patch', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    const [puppet] = rig.session.bots
    expect(puppet?.alive).toBe(true)
    expect(puppet?.body.position).toEqual(AHEAD)
    expect(puppet?.aimM).toEqual({ x: 0, y: 0, z: -1 })
    const seen: string[] = []
    rig.session.forEachRoomPlayer((playerId, fighter) => {
      seen.push(`${playerId}@${fighter.body.position.z}`)
    })
    expect(seen).toEqual(['ana@20'])
  })

  /** A velocidade escolhe o clipe de andar do avatar, e o patch só traz a posição. */
  it('tira a velocidade do fantoche da diferença entre dois quadros', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    rig.room.remotes.set('ana', snapshotAt({ x: 0.1, y: 0, z: 20 }))
    rig.frame()
    expect(rig.session.bots[0]?.body.velocity.x).toBeCloseTo(0.1 / FRAME_S, 6)
  })

  /** O primeiro quadro do babylon tem tempo zero: dividir por ele daria infinito. */
  it('num quadro sem tempo, a velocidade fica como estava', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.session.followRoom(rig.room, 0, 0)
    expect(rig.session.bots[0]?.body.velocity.x).toBe(0)
  })

  it('o morto da sala fica fora da arena, mas não no banco', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD, false))
    rig.frame()
    const [puppet] = rig.session.bots
    expect(puppet?.alive).toBe(false)
    expect(puppet && isBenched(puppet)).toBe(false)
  })

  it('quem sai da sala libera a vaga e sai do placar', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    rig.room.remotes.delete('ana')
    rig.frame()
    expect(rig.session.bots.every(isBenched)).toBe(true)
    expect(rig.session.scoreboard.players.size).toBe(1)
  })

  it('com mais jogadores que vagas, quem não coube não aparece', () => {
    const rig = mountOnline()
    for (const name of ['ana', 'bia', 'caio', 'davi']) rig.room.remotes.set(name, snapshotAt(AHEAD))
    rig.frame()
    const seen: string[] = []
    rig.session.forEachRoomPlayer((playerId) => seen.push(playerId))
    expect(seen).toEqual(['ana', 'bia', 'caio'])
    // quem não coube sai sem ter tido vaga, e ninguém perde a sua.
    rig.room.remotes.delete('davi')
    rig.frame()
    expect(rig.session.bots.filter((bot) => bot.alive)).toHaveLength(3)
  })
})

describe('followRoom, as mortes da sala', () => {
  /** A kill do servidor passa pelo `recordKill` de sempre: placar, medalhas e killfeed. */
  it('pontua a kill do jogador local no placar, com o id da sessão', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    rig.room.kill('eu', 'ana')
    rig.frame()
    const local = rig.session.scoreboard.players.get(LOCAL_PLAYER_ID)
    expect(local?.kills).toBe(1)
    expect(rig.session.bots[0]?.alive).toBe(false)
  })

  /**
   * Regressão: a sala era lida antes do `advance`, e o `advance` zerava o
   * registro do quadro, então a kill da sala sumia do killfeed e as medalhas
   * dela, da tela.
   */
  it('a kill da sala chega ao killfeed e às medalhas do quadro em que chegou', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    rig.room.kill('eu', 'ana')
    rig.frame()
    const { lastKills, lastMedals } = rig.session
    expect(lastKills.slots.slice(0, lastKills.count).map((kill) => kill.shooterId)).toEqual([
      LOCAL_PLAYER_ID,
    ])
    expect(lastMedals.length).toBeGreaterThan(0)
  })

  it('morto pela sala, congela, diz quem matou, e volta onde o servidor o põe', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    rig.room.kill('ana', 'eu', 'katana')
    rig.frame()
    expect(rig.session.local.alive).toBe(false)
    expect(rig.session.killedBy).toBe(rig.session.bots[0]?.id)
    // online, o respawn é do servidor: o relógio local não o traz de volta.
    for (let frame = 0; frame < 300; frame += 1) rig.frame()
    expect(rig.session.local.alive).toBe(false)
    rig.room.spawn = { x: 5, y: 0, z: -5 }
    rig.frame()
    expect(rig.session.local.alive).toBe(true)
    expect(rig.session.killedBy).toBeNull()
    expect(rig.session.character.current.position.x).toBeCloseTo(5, 1)
  })

  /**
   * Regressão: com a arena parada no menu o `advance` não roda, o registro do
   * quadro não zerava, e a tela reprisava as mesmas kills a cada quadro.
   */
  it('com a arena parada, a kill da sala fica só no quadro em que chegou', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    rig.room.kill('eu', 'ana')
    rig.session.followRoom(rig.room, 0, FRAME_S)
    expect(rig.session.lastKills.count).toBe(1)
    rig.session.followRoom(rig.room, 0, FRAME_S)
    expect(rig.session.lastKills.count).toBe(0)
  })

  it('ignora a kill de quem a sessão ainda não viu', () => {
    const rig = mountOnline()
    rig.frame()
    rig.room.kill('fantasma', 'eu')
    rig.frame()
    expect(rig.session.local.alive).toBe(true)
  })

  /** A própria morte fora da área já foi contada pela predição: contar de novo dobraria. */
  it('conta a morte fora da área de quem está na sala, e não a própria', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    rig.room.boundaryDeaths.push('ana', 'eu', 'fantasma')
    rig.frame()
    const deaths = [...rig.session.scoreboard.players.values()].map((score) => score.deaths)
    expect(deaths).toEqual([0, 1])
  })
})

describe('followRoom, os nomes', () => {
  /** O placar, o killfeed e as telas de abate escrevem o nome da sala, e não o do bot da vaga. */
  it('o fantoche leva o nome do jogador da sala, e a vaga liberada volta ao do bot', () => {
    const rig = mountOnline()
    const [puppet] = rig.session.bots
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    expect(rig.session.nameOf(puppet?.id ?? '')).toBe('ANA')
    rig.room.remotes.delete('ana')
    rig.frame()
    expect(rig.session.nameOf(puppet?.id ?? '')).toBe(puppet?.callsign)
  })

  it('sem nome no patch, a vaga fica com o nome do bot', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', { ...snapshotAt(AHEAD), name: '' })
    rig.frame()
    const [puppet] = rig.session.bots
    expect(rig.session.nameOf(puppet?.id ?? '')).toBe(puppet?.callsign)
  })

  it('manda o próprio nome uma vez, e de novo só quando a partida o troca', () => {
    const rig = mountOnline()
    rig.frame()
    rig.frame()
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: false, callsign: 'RAIDEN' })
    rig.frame()
    expect(rig.room.callsigns).toEqual([rig.room.callsigns[0], 'RAIDEN'])
    expect(rig.room.callsigns).toHaveLength(2)
  })
})

describe('followRoom, os tiros da sala', () => {
  it('o tiro de outro jogador vira o rastro da vaga dele, como o de um bot', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.room.remotes.set('bia', snapshotAt({ x: 5, y: 0, z: 20 }))
    rig.frame()
    rig.room.shoot('bia', true)
    rig.frame()
    const { lastBotShots } = rig.session
    expect(lastBotShots.count).toBe(1)
    expect(lastBotShots.slots[0]).toMatchObject({ botIndex: 1, toM: { x: 0, y: 1, z: 0 } })
    expect(lastBotShots.slots[0]?.hitFighter).toBe(true)
  })

  /** O próprio rastro já saiu da predição, no quadro do disparo. */
  it('ignora o próprio tiro e o de quem a sessão ainda não viu', () => {
    const rig = mountOnline()
    rig.frame()
    rig.room.shoot('eu')
    rig.room.shoot('desconhecido')
    rig.frame()
    expect(rig.session.lastBotShots.count).toBe(0)
  })
})

describe('sessão online, a autoridade do servidor', () => {
  /** O acerto é do servidor: o tiro local desenha, mas a kill só vem pela sala. */
  it('o tiro local num jogador da sala não pontua sozinho', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    settleScope(rig as unknown as Parameters<typeof settleScope>[0])
    rig.weaponInput.fire = true
    rig.frame()
    // o fantoche da vaga 0 é o combatente 1: o jogador local é o 0.
    expect(rig.session.lastShot?.targetIndex).toBe(1)
    expect(rig.session.bots[0]?.alive).toBe(true)
    expect([...rig.session.scoreboard.players.values()].every((score) => score.kills === 0)).toBe(
      true,
    )
  })

  it('o golpe local num jogador da sala não pontua sozinho', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt({ x: 0, y: 0, z: 1.2 }))
    rig.frame()
    rig.weaponInput.melee = true
    rig.frame()
    rig.weaponInput.melee = false
    for (let frame = 0; frame < 5; frame += 1) rig.frame()
    expect(rig.session.bots[0]?.alive).toBe(true)
  })

  /** A partida nova do menu não move o corpo: o lugar é do servidor. */
  it('a partida nova não põe o jogador no primeiro spawn nem senta bots', () => {
    const rig = mountOnline()
    rig.frame()
    rig.session.character.respawnAt({ x: 7, y: 0, z: 7 })
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: true })
    expect(rig.session.character.current.position.x).toBe(7)
    expect(rig.session.bots.every(isBenched)).toBe(true)
  })

  /** Predição e servidor andam com o mesmo arredondamento, senão toda confirmação vira correção. */
  it('anda e mira com o input arredondado como o fio o leva', () => {
    const rig = mountOnline()
    rig.frame()
    rig.movementInput.wishX = 0.3141592
    rig.frame({ x: 0.123456, y: 0, z: 1 })
    const last = rig.ticks.at(-1)
    expect(last?.wishX).toBe(wishOnWire(0.3141592))
    expect(last?.aimX).not.toBe(0.123456)
    expect(last?.aimX).toBeCloseTo(0.123456 / Math.hypot(0.123456, 1), 4)
  })

  it('offline, o input vai cru, como sempre foi', () => {
    const rig = mountOnline()
    rig.room.ownId = undefined
    rig.frame()
    rig.movementInput.wishX = 0.3141592
    rig.frame({ x: 0.123456, y: 0, z: 1 })
    expect(rig.ticks.at(-1)).toEqual({ wishX: 0.3141592, aimX: 0.123456 })
  })

  it('config da sala de testes tem vagas de bot para os fantoches', () => {
    expect(config.match.playersPerRoom - 1).toBe(3)
  })
})
