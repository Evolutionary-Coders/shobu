import {
  type CharacterState,
  copyCharacterState,
  createCharacterState,
  createShotHit,
  createTargetList,
  describeSniperKill,
  eyeOf,
  type Fighter,
  fighterShotRandom,
  type GameplayConfig,
  MATCH_SEED_BASE,
  type MutableKillEvent,
  pushTarget,
  resetTargetList,
  resolveShot,
  type ShotHit,
  type StaticBox,
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
  readonly seenFeet: Vector3
  /** A vítima como o atirador a viu: o corpo dela, nos pés rebobinados. */
  readonly seenVictim: { -readonly [Key in keyof Fighter]: Fighter[Key] } & {
    body: CharacterState
  }
  readonly coneTangent: number
}

export function createRoomShot(config: GameplayConfig): RoomShot {
  const origin = { x: 0, y: 0, z: 0 }
  return {
    targets: createTargetList(config.match.playersPerRoom),
    targetSeats: [],
    hit: createShotHit(),
    origin,
    seenFeet: { x: 0, y: 0, z: 0 },
    seenVictim: {
      id: '',
      body: createCharacterState(origin, config),
      facingM: { x: 0, y: 0, z: -1 },
      alive: true,
      respawnLeftS: 0,
    },
    coneTangent: spreadTangent(config.weapon.noScopeSpreadDeg),
  }
}

/**
 * O tiro que saiu neste input, validado pelo servidor. Sai do olho do tick,
 * com a mira do fio e a semente do contador de tiros, como a predição do
 * cliente (`tryLocalShot`): o mesmo raio, sorteado com a mesma semente, porque
 * lá o atirador é sempre o índice 0. Os alvos são os outros jogadores vivos,
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
      originM: eyeOf(shooter.body, shot.origin),
      aimM: shooter.aimM,
      exact: shooter.arsenal.weapon.firedExact,
      spreadTangent: shot.coneTangent,
      maxDistanceM: config.weapon.hitscanRangeM,
    },
    boxes,
    shot.targets,
    fighterShotRandom(MATCH_SEED_BASE, 0, shooter.arsenal.weapon.shotsFired),
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
  for (const [targetId, target] of seats) {
    if (target === shooter || !target.fighter.alive) continue
    const feetM = feetSeenBy(shooter.fighter.id, targetId, shot.seenFeet)
    pushTarget(
      shot.targets,
      shot.targetSeats.length,
      feetM,
      config.collision.capsuleRadiusM,
      target.body.capsuleHeightM,
    )
    shot.targetSeats.push(target)
  }
}

/**
 * A kill como o núcleo a descreve (`describeSniperKill`), com a vítima nos pés
 * rebobinados: a altura do acerto é contra a cápsula em que o raio bateu.
 *
 * ```ts
 * io.onKill(describeRoomKill(room.shot, seat, victim, room.kill, room.matchTimeS))
 * ```
 */
export function describeRoomKill(
  shot: RoomShot,
  shooter: RoomSeat,
  victim: RoomSeat,
  into: MutableKillEvent,
  atS: number,
): MutableKillEvent {
  const seen = shot.seenVictim
  copyCharacterState(victim.body, seen.body)
  // o `sourceIndex` de cada caixa é a posição dela, então só a do alvo
  // atingido bate, inclusive entre as sobras de disparos anteriores.
  for (const box of shot.targets.boxes) {
    if (box.sourceIndex !== shot.hit.targetIndex) continue
    seen.body.position.x = box.feetX
    seen.body.position.y = box.feetY
    seen.body.position.z = box.feetZ
  }
  seen.id = victim.fighter.id
  return describeSniperKill(into, {
    shooter: shooter.fighter,
    victim: seen,
    shot: shot.hit,
    weapon: shooter.arsenal.weapon,
    atS,
  })
}
