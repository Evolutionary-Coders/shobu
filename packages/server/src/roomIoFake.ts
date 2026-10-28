import type { Fighter, KillEvent, ShotMessage, Vector3, WireInput } from '@shobu/core'
import type { RoomIo, RoomSimulation } from './roomSimulation.ts'

/**
 * O colyseus do lado da sala, em memória, para os testes da sala e dos bots:
 * a fila de input por jogador, o rewind e os avisos. Sem posição rebobinada
 * marcada (`seenFeet`), o atirador vê o alvo onde o alvo está agora.
 *
 * ```ts
 * const io = new FakeRoomIo(room)
 * io.push('ana', fireInput)
 * stepRoom(room, io, rules)
 * ```
 */
export class FakeRoomIo implements RoomIo {
  readonly #queues = new Map<string, WireInput[]>()
  readonly seenFeet = new Map<string, Vector3>()
  readonly kills: KillEvent[] = []
  readonly boundaryDeaths: string[] = []
  readonly shots: ShotMessage[] = []

  constructor(readonly room: RoomSimulation) {}

  push(playerId: string, input: WireInput, times = 1): void {
    const queue = this.#queueOf(playerId)
    for (let index = 0; index < times; index += 1) queue.push(input)
  }

  remaining(playerId: string): number {
    return this.#queueOf(playerId).length
  }

  nextInput(playerId: string): WireInput | undefined {
    return this.#queueOf(playerId).shift()
  }

  #queueOf(playerId: string): WireInput[] {
    const queue = this.#queues.get(playerId) ?? []
    this.#queues.set(playerId, queue)
    return queue
  }

  readonly feetSeenBy = (_shooterId: string, targetId: string, out: Vector3): Vector3 => {
    const now = (this.room.fighters.find((fighter) => fighter.id === targetId) as Fighter).body
    return Object.assign(out, this.seenFeet.get(targetId) ?? now.position)
  }

  readonly onKill = (kill: Readonly<KillEvent>): void => {
    this.kills.push({ ...kill })
  }

  readonly onBoundaryDeath = (playerId: string): void => {
    this.boundaryDeaths.push(playerId)
  }

  readonly onShot = (shot: Readonly<ShotMessage>): void => {
    this.shots.push({ ...shot, fromM: { ...shot.fromM }, toM: { ...shot.toM } })
  }

  /** As kills como `atirador>vítima:arma`, que é como os testes as comparam. */
  killList(): string[] {
    return this.kills.map((kill) => `${kill.shooterId}>${kill.victimId}:${kill.weapon}`)
  }
}
