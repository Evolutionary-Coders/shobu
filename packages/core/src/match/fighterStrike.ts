import type { StaticBox } from '../collision/staticBox.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'
import type { MeleeReach } from '../melee/meleeReach.ts'
import type { MeleeWeapon } from '../melee/meleeState.ts'
import { type MeleeHit, resolveMeleeStrike } from '../melee/resolveMeleeStrike.ts'
import type { MutableKillEvent } from '../scoring/killEvent.ts'
import type { Fighter } from './fighter.ts'

/** O que todo golpe da arena compartilha: a geometria, a config e os arcos. */
export interface StrikeRange {
  readonly boxes: readonly StaticBox[]
  readonly config: GameplayConfig
  /** Os cossenos dos arcos saem uma vez por carga de config (`createMeleeReach`). */
  readonly reach: MeleeReach
}

/** Quem golpeou, de onde, para onde, e com que arma. */
export interface FighterStrike {
  readonly strikerIndex: number
  readonly eyeM: Readonly<Vector3>
  readonly aimM: Readonly<Vector3>
  readonly weapon: MeleeWeapon
}

/**
 * O golpe de um combatente contra todos os outros, no molde de
 * `resolveFighterShot`: o mesmo para o jogador e para o bot. Devolve o índice
 * da vítima, ou -1.
 *
 * ```ts
 * const victim = resolveFighterStrike({ strikerIndex: 0, eyeM, aimM, weapon: 'katana' }, fighters, range, hit)
 * ```
 */
export function resolveFighterStrike(
  strike: FighterStrike,
  fighters: readonly Fighter[],
  range: StrikeRange,
  out: MeleeHit,
): number {
  return resolveMeleeStrike(
    {
      strikerIndex: strike.strikerIndex,
      eyeM: strike.eyeM,
      aimM: strike.aimM,
      reach: range.reach[strike.weapon],
    },
    fighters,
    range.boxes,
    range.config.collision.capsuleRadiusM,
    out,
  )
}

export interface MeleeKillMoment {
  readonly striker: Fighter
  readonly victim: Fighter
  readonly weapon: MeleeWeapon
  readonly hit: Readonly<MeleeHit>
  readonly atS: number
}

/**
 * A kill de lâmina, no mesmo evento reaproveitado da kill de sniper: as
 * medalhas leem só isto. Sem luneta e sem altura de acerto — `headshot` é
 * medalha de mira —, e com o olhar da vítima, que é o `backstab`.
 *
 * ```ts
 * describeMeleeKill(kill, { striker, victim, weapon: 'knife', hit, atS })
 * ```
 */
export function describeMeleeKill(
  into: MutableKillEvent,
  moment: MeleeKillMoment,
): MutableKillEvent {
  const { striker, victim } = moment
  into.shooterId = striker.id
  into.victimId = victim.id
  into.atS = moment.atS
  into.weapon = moment.weapon
  into.scoped = false
  into.distanceM = moment.hit.distanceM
  into.shooterAirborne = !striker.body.grounded
  into.victimAirborne = !victim.body.grounded
  into.shooterGrappling = striker.body.grappleAttached
  into.hitHeightRatio = 0
  into.shooterYawTurnDeg = 0
  into.victimFacingAwayDeg = facingAwayDeg(victim, striker)
  into.victimsInShot = 1
  return into
}

/**
 * O ângulo, no plano do chão, entre o olhar da vítima e a direção de quem a
 * golpeou: 0° é de frente, 180° é de costas. Sem olhar no plano (olhando
 * reto para cima) ou com os dois no mesmo ponto, não há costas: 0.
 *
 * `Math.acos` vai para o **evento**, não para o estado: a medalha compara com
 * `backstabAngleDeg` e nada da simulação lê este número de volta.
 */
export function facingAwayDeg(victim: Fighter, striker: Fighter): number {
  const lookX = victim.facingM.x
  const lookZ = victim.facingM.z
  const towardX = striker.body.position.x - victim.body.position.x
  const towardZ = striker.body.position.z - victim.body.position.z
  const lengths = Math.sqrt(
    (lookX * lookX + lookZ * lookZ) * (towardX * towardX + towardZ * towardZ),
  )
  if (lengths === 0) return 0
  const cosine = Math.min(1, Math.max(-1, (lookX * towardX + lookZ * towardZ) / lengths))
  return (Math.acos(cosine) * 180) / Math.PI
}
