import {
  createKillEvent,
  encodePrimaryWeapon,
  encodeStance,
  type KillEvent,
  type MeleeWeapon,
  type PrimaryWeapon,
  quantizePositionM,
  type ScorestreakActivatedMessage,
  type ScorestreakEarnedMessage,
  type ScorestreakSlug,
  type ShotMessage,
  type Vector3,
} from '@shobu/core'
import type { PlayerSnapshotFields } from '../net/remotePlayerView.ts'
import type { OfficialScoreFields, RoomMatchView } from '../net/roomMatchView.ts'
import type { RoomFeed } from './arenaOnline.ts'
import { type ArenaSession, createArenaSession } from './arenaSession.ts'
import { FLOOR, FRAME_S, ROOM_RULES, sessionOptionsFor } from './arenaSessionTestKit.ts'
import { createWeaponInput, type MutableWeaponInput } from './weaponInputFrom.ts'
import { createMovementInput, type MutableMovementInput } from './wishDirection.ts'

/**
 * A sala dos testes da sessão online: uma sala do servidor em memória e a
 * sessão ligada a ela. Mora fora dos arquivos de teste porque são dois — o da
 * sala (`arenaOnline.test.ts`) e o das séries (`arenaScorestreaks.test.ts`) —,
 * como o `arenaSessionTestKit.ts`.
 */

/** Um jogador da sala, parado onde o teste quer, vivo, olhando para -z. */
export function snapshotAt(
  feetM: Vector3,
  alive = true,
  primary: PrimaryWeapon = 'laser',
): PlayerSnapshotFields {
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
    primary: encodePrimaryWeapon(primary),
  }
}

/** A sala do servidor, em memória: quem está nela, as mortes e o próximo spawn. */
export class FakeRoom implements RoomFeed {
  ownId: string | undefined = 'eu'
  readonly remotes = new Map<string, PlayerSnapshotFields>()
  readonly kills: KillEvent[] = []
  readonly boundaryDeaths: string[] = []
  readonly shots: ShotMessage[] = []
  spawn: Vector3 | undefined = undefined
  readonly callsigns: string[] = []
  readonly melees: MeleeWeapon[] = []
  readonly primaries: PrimaryWeapon[] = []
  readonly scorestreakLoadouts: (readonly ScorestreakSlug[])[] = []
  readonly scorestreakRequests: number[] = []
  readonly scorestreaksEarned: ScorestreakEarnedMessage[] = []
  readonly scorestreaksActivated: ScorestreakActivatedMessage[] = []
  /** A partida da sala; `undefined` é o servidor que ainda não mandou estado. */
  match: RoomMatchView | undefined = undefined
  /** Onde a sala pôs o jogador, vivo: o spawn que `restartOwnSpawn` devolve. */
  ownFeetM: Vector3 | undefined = undefined

  /** O placar oficial no estado da sala, pelo id da sala. */
  readonly scores = new Map<string, OfficialScoreFields>()

  forEachOfficialScore(visit: (playerId: string, score: OfficialScoreFields) => void): void {
    for (const [playerId, score] of this.scores) visit(playerId, score)
  }

  matchState(): RoomMatchView | undefined {
    return this.match
  }

  restartOwnSpawn(): void {
    this.spawn = this.ownFeetM
  }

  chooseScorestreaks(scorestreaks: readonly ScorestreakSlug[]): void {
    this.scorestreakLoadouts.push(scorestreaks)
  }

  requestScorestreak(slot: number): void {
    this.scorestreakRequests.push(slot)
  }

  drainScorestreakEarned(visit: (earned: ScorestreakEarnedMessage) => void): void {
    for (const earned of this.scorestreaksEarned.splice(0)) visit(earned)
  }

  drainScorestreakActivated(visit: (activated: ScorestreakActivatedMessage) => void): void {
    for (const activated of this.scorestreaksActivated.splice(0)) visit(activated)
  }

  chooseCallsign(callsign: string): void {
    this.callsigns.push(callsign)
  }

  chooseMelee(weapon: MeleeWeapon): void {
    this.melees.push(weapon)
  }

  choosePrimary(weapon: PrimaryWeapon): void {
    this.primaries.push(weapon)
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

export interface OnlineRig {
  readonly session: ArenaSession
  readonly room: FakeRoom
  readonly weaponInput: MutableWeaponInput
  readonly movementInput: MutableMovementInput
  readonly ticks: { wishX: number; aimX: number; aim: Vector3 }[]
  /** Um quadro: o que a sala mudou, e o avanço da arena. */
  frame(aimM?: Vector3): number
}

/** A sessão dos testes, com a sala ligada: as três vagas de bot viram fantoches. */
export function mountOnline(): OnlineRig {
  const weaponInput = createWeaponInput()
  const movementInput = createMovementInput()
  const ticks: { wishX: number; aimX: number; aim: Vector3 }[] = []
  const session = createArenaSession({
    ...sessionOptionsFor([FLOOR], { humans: 1 }, { weaponInput, movementInput }),
    onTick: (movement, _weapon, aimM) =>
      ticks.push({ wishX: movement.wishX, aimX: aimM.x, aim: { ...aimM } }),
  })
  session.restartMatch({ ...ROOM_RULES, hostileBots: false })
  const room = new FakeRoom()
  const frame = (aimM: Vector3 = { x: 0, y: 0, z: 1 }): number => {
    session.followRoom(room, 0, FRAME_S)
    return session.advance({ elapsedS: FRAME_S, aimM })
  }
  return { session, room, weaponInput, movementInput, ticks, frame }
}

export const AHEAD = { x: 0, y: 0, z: 20 }
