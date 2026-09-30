import {
  createShotHit,
  createTargetList,
  dequantizeAim,
  eyeOf,
  type GameplayConfig,
  hitHeightRatio,
  type KillMessage,
  pushTarget,
  resetTargetList,
  resolveShot,
  type ShotHit,
  type StaticBox,
  shotRandom,
  spreadTangent,
  type TargetList,
  type Vector3,
} from '@shobu/core'
import type { RoomSeat } from './roomSimulation.ts'

/**
 * Onde o atirador viu o alvo: os pés do alvo no instante que a tela do
 * atirador mostrava quando ele atirou, em metros. No servidor é o rewind do
 * colyseus lido pelo último input consumido do atirador; nos testes, um fake.
 */
export type FeetSeenBy = (shooterId: string, targetId: string, out: Vector3) => Vector3

/** Os rascunhos do tiro da sala, reaproveitados: nada aloca por disparo. */
export interface RoomShot {
  readonly targets: TargetList
  /** O assento de cada alvo, na posição do `sourceIndex` dele. */
  readonly targetSeats: RoomSeat[]
  readonly hit: ShotHit
  readonly origin: Vector3
  readonly aim: Vector3
  readonly seenFeet: Vector3
  readonly coneTangent: number
}

export function createRoomShot(config: GameplayConfig): RoomShot {
  return {
    targets: createTargetList(config.match.playersPerRoom),
    targetSeats: [],
    hit: createShotHit(),
    origin: { x: 0, y: 0, z: 0 },
    aim: { x: 0, y: 0, z: -1 },
    seenFeet: { x: 0, y: 0, z: 0 },
    coneTangent: spreadTangent(config.weapon.noScopeSpreadDeg),
  }
}

/**
 * O tiro que saiu neste input, validado pelo servidor. Sai do olho do tick,
 * com a mira do fio e a semente do contador de tiros: o mesmo raio que o
 * cliente previu (`arenaSession.ts`). Os alvos são os outros jogadores vivos,
 * nas posições rebobinadas para o que o atirador via. Devolve o assento
 * atingido, ou `undefined` quando o tiro achou parede ou nada.
 *
 * ```ts
 * const victim = resolveRoomShot(room.shot, room.seats, seat, io.feetSeenBy, boxes, config)
 * ```
 */
export function resolveRoomShot(
  shot: RoomShot,
  seats: ReadonlyMap<string, RoomSeat>,
  shooter: RoomSeat,
  feetSeenBy: FeetSeenBy,
  boxes: readonly StaticBox[],
  config: GameplayConfig,
): RoomSeat | undefined {
  collectSeenTargets(shot, seats, shooter, feetSeenBy, config)
  resolveShot(
    {
      originM: eyeOf(shooter.player.character, shot.origin),
      aimM: dequantizeAim(shooter.aim, shot.aim),
      exact: shooter.weapon.firedExact,
      spreadTangent: shot.coneTangent,
      maxDistanceM: config.weapon.hitscanRangeM,
    },
    boxes,
    shot.targets,
    shotRandom(shooter.weapon.shotsFired),
    shot.hit,
  )
  // o tiro na parede traz -1, que não é posição de array: uma guarda só.
  return shot.targetSeats[shot.hit.targetIndex]
}

/**
 * A altura do alvo é a de agora, e não a rebobinada: o rewind só grava a
 * posição (`gameRoom.ts`). ponytail: quem agacha no instante do tiro tem a
 * cápsula de agora; rebobinar a postura entra se a diferença aparecer em jogo.
 */
function collectSeenTargets(
  shot: RoomShot,
  seats: ReadonlyMap<string, RoomSeat>,
  shooter: RoomSeat,
  feetSeenBy: FeetSeenBy,
  config: GameplayConfig,
): void {
  resetTargetList(shot.targets)
  shot.targetSeats.length = 0
  const shooterId = shooter.player.playerId
  for (const [targetId, target] of seats) {
    if (target === shooter || !target.alive) continue
    const feetM = feetSeenBy(shooterId, targetId, shot.seenFeet)
    pushTarget(
      shot.targets,
      shot.targetSeats.length,
      feetM,
      config.collision.capsuleRadiusM,
      target.player.character.capsuleHeightM,
    )
    shot.targetSeats.push(target)
  }
}

/**
 * A kill como o atirador a pontua, tirada do tiro que acabou de ser resolvido:
 * a altura do acerto é contra a cápsula rebobinada, a mesma em que o raio bateu.
 *
 * ```ts
 * io.onKill(shooterId, describeRoomKill(room.shot, seat, victim))
 * ```
 */
export function describeRoomKill(shot: RoomShot, shooter: RoomSeat, victim: RoomSeat): KillMessage {
  // o `sourceIndex` de cada caixa é a posição dela, então só a do alvo
  // atingido bate, inclusive entre as sobras de ticks anteriores.
  for (const box of shot.targets.boxes) {
    if (box.sourceIndex !== shot.hit.targetIndex) continue
    shot.seenFeet.x = box.feetX
    shot.seenFeet.y = box.feetY
    shot.seenFeet.z = box.feetZ
  }
  return {
    victimId: victim.player.playerId,
    distanceM: shot.hit.distanceM,
    hitHeightRatio: hitHeightRatio(
      shot.hit.endpointM,
      shot.seenFeet,
      victim.player.character.capsuleHeightM,
    ),
    scoped: shooter.weapon.firedScoped,
    shooterAirborne: !shooter.player.character.grounded,
  }
}
