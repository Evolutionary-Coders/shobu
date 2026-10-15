import type { StaticBox } from '../collision/staticBox.ts'
import type { TargetList } from '../collision/targetList.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { createSeededRandom, type SeededRandom } from '../math/seededRandom.ts'
import type { Vector3 } from '../math/vector3.ts'
import type { MutableKillEvent } from '../scoring/killEvent.ts'
import { hitHeightRatio } from '../weapon/hitHeight.ts'
import { resolveShot, type ShotHit } from '../weapon/resolveShot.ts'
import type { WeaponState } from '../weapon/weaponState.ts'
import { collectFighterTargets, type Fighter } from './fighter.ts'

/** O que todo tiro da arena compartilha: a geometria, a configuração e os rascunhos. */
export interface ShotRange {
  readonly boxes: readonly StaticBox[]
  readonly config: GameplayConfig
  /** A tangente do cone sai uma vez por carga de config, nunca por tiro. */
  readonly coneTangent: number
  readonly targets: TargetList
}

/** De onde e para onde o tiro de um combatente saiu, e com que arma. */
export interface FighterAim {
  readonly shooterIndex: number
  readonly eyeM: Readonly<Vector3>
  readonly aimM: Readonly<Vector3>
  /** A arma depois do `stepWeapon` do tick: `firedExact` e `shotsFired` vêm dela. */
  readonly weapon: Readonly<WeaponState>
  /** A semente da partida. Com o contador de tiros, é a identidade do tiro. */
  readonly seedBase: number
}

/**
 * O tiro de um combatente contra todos os outros. Devolve o índice da vítima
 * em `fighters`, ou -1 quando o tiro achou parede ou nada, e escreve o rastro
 * em `out`.
 *
 * O mesmo para o jogador e para o bot: mesma arma, mesmo cone, mesma regra de
 * parede antes do alvo (`resolveShot`). A semente mistura o id do atirador,
 * senão dois combatentes no mesmo número de tiro desviariam igual.
 *
 * ```ts
 * const victim = resolveFighterShot({ shooterIndex: 0, eyeM, aimM, weapon, seedBase }, fighters, range, hit)
 * ```
 */
export function resolveFighterShot(
  aim: FighterAim,
  fighters: readonly Fighter[],
  range: ShotRange,
  out: ShotHit,
): number {
  collectFighterTargets(fighters, aim.shooterIndex, range.config, range.targets)
  resolveShot(
    {
      originM: aim.eyeM,
      aimM: aim.aimM,
      exact: aim.weapon.firedExact,
      spreadTangent: range.coneTangent,
      maxDistanceM: range.config.weapon.hitscanRangeM,
    },
    range.boxes,
    range.targets,
    fighterShotRandom(aim.seedBase, aim.shooterIndex, aim.weapon.shotsFired),
    out,
  )
  return out.targetIndex
}

/**
 * O sorteio do cone de um tiro. Fica exposto porque o servidor de jogo
 * resolve o tiro contra os alvos rebobinados, sem `resolveFighterShot`, e
 * precisa sortear a mesma direção que a predição do cliente sorteou.
 *
 * ```ts
 * resolveShot(shot, boxes, rewoundTargets, fighterShotRandom(seedBase, 0, weapon.shotsFired), hit)
 * ```
 */
export function fighterShotRandom(
  seedBase: number,
  shooterIndex: number,
  shotsFired: number,
): SeededRandom {
  return createSeededRandom(
    seedBase ^ Math.imul(shooterIndex + 1, SHOOTER_SEED_STRIDE) ^ shotsFired,
  )
}

/**
 * A semente base de uma partida sem outra escolhida. Mora no núcleo porque o
 * servidor de jogo sorteia o cone do tiro de cada jogador com a mesma base que
 * a predição do cliente usou.
 */
export const MATCH_SEED_BASE = 20_251_119

/** Um primo grande: atiradores vizinhos caem em sementes longe uma da outra. */
const SHOOTER_SEED_STRIDE = 0x9e37_79b1

/**
 * A kill de sniper como a resolução de acerto a viu, escrita no evento
 * reaproveitado. É o mesmo evento para quem matou e para quem morreu, seja
 * jogador ou bot: as medalhas leem só isto (`awardMedals`).
 *
 * ```ts
 * describeSniperKill(kill, { shooter, victim, shot, weapon, atS })
 * ```
 */
export function describeSniperKill(
  into: MutableKillEvent,
  moment: SniperKillMoment,
): MutableKillEvent {
  const { shooter, victim, shot } = moment
  into.shooterId = shooter.id
  into.victimId = victim.id
  into.atS = moment.atS
  into.weapon = 'sniper'
  into.scoped = moment.weapon.firedScoped
  into.distanceM = shot.distanceM
  into.shooterAirborne = !shooter.body.grounded
  into.victimAirborne = !victim.body.grounded
  // o estado de antes do passo do corpo: a arma anda primeiro no tick, e é
  // nesse instante que o tiro sai (ver `stepArenaTick`).
  into.shooterGrappling = shooter.body.grappleAttached
  // a cápsula da vítima no instante do tiro, e não a da configuração: quem
  // estava agachado tem a cabeça mais baixa.
  into.hitHeightRatio = hitHeightRatio(
    shot.endpointM,
    victim.body.position,
    victim.body.capsuleHeightM,
  )
  describeMissingMechanics(into)
  return into
}

export interface SniperKillMoment {
  readonly shooter: Fighter
  readonly victim: Fighter
  readonly shot: Readonly<ShotHit>
  readonly weapon: Readonly<WeaponState>
  readonly atS: number
}

/**
 * Os campos cuja mecânica ainda não existe, todos no valor neutro. Ficam numa
 * função só, e não espalhados, para a lista do que falta ser legível de uma
 * vez — `killEvent.ts` diz o que destrava cada um.
 */
function describeMissingMechanics(into: MutableKillEvent): void {
  into.shooterYawTurnDeg = 0
  into.victimFacingCos = 1
  into.victimsInShot = 1
}
