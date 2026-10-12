import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'
import type { CharacterState } from '../movement/characterState.ts'
import { canDash } from '../movement/dash.ts'
import type { MovementInput } from '../movement/movementInput.ts'
import { stepWeapon } from '../weapon/stepWeapon.ts'
import type { WeaponInput } from '../weapon/weaponInput.ts'
import { closeScope, type WeaponState, weaponHoldsSprint } from '../weapon/weaponState.ts'
import type { MeleeState } from './meleeState.ts'
import { stepMelee } from './stepMelee.ts'

/** As duas armas de um combatente: a sniper e o slot de corpo a corpo. */
export interface Arsenal {
  readonly weapon: WeaponState
  readonly melee: MeleeState
}

/**
 * Um tick das duas armas, nesta ordem: o corpo a corpo primeiro, porque é ele
 * quem decide se a sniper está no coldre neste tick; a sniper depois. É o
 * passo que o jogador, o bot e — amanhã — o servidor chamam no lugar do
 * `stepWeapon` puro, **antes do corpo**, como antes (ADR 0021).
 *
 * O que ele amarra entre as duas:
 * - **katana na mão é sniper no coldre**: ela não atira nem mira, e a recarga
 *   segue.
 * - **guardar a katana custa `sniperRaiseS`**: o tiro pedido nesse meio espera
 *   a sniper subir, como no sprint-to-fire.
 * - **o golpe rápido fecha a luneta** e não mexe em mais nada da sniper: não
 *   cancela a recarga (gdd).
 * - **correndo, a sniper está abaixada** (`sprintToFireS`), e mais ainda na
 *   corrida tática plena (`tacticalSprintToFireS`). O corpo lido é o do fim do
 *   tick anterior, pelo mesmo motivo do `grounded` de `stepCharacter`.
 *
 * ```ts
 * stepArsenal({ weapon, melee }, weaponInput, character.current, aimM, config, dtS)
 * ```
 */
export function stepArsenal(
  arsenal: Arsenal,
  input: WeaponInput,
  body: Readonly<CharacterState>,
  aimM: Readonly<Vector3>,
  config: GameplayConfig,
  dtS: number,
): void {
  const { weapon, melee } = arsenal
  const wasDrawn = melee.bladeDrawn
  stepMelee(melee, input, canDash(body, aimM.x, aimM.z), config, dtS)
  if (wasDrawn && !melee.bladeDrawn) raiseSniper(weapon, input, config)
  weapon.holstered = melee.bladeDrawn
  if (melee.struckThisTick) closeScope(weapon)
  stepWeapon(weapon, input, config, dtS, loweredForS(body, config))
}

/**
 * A katana guardada neste tick: a sniper sobe em `sniperRaiseS`, e as bordas
 * deste tick ficam com a lâmina. O clique que cortava e a mira que investia
 * eram vistos de novo pela sniper, que os guardava (`fireQueued`) e atirava
 * ou abria a luneta ao subir — um clique, dois ataques (revisão do núcleo).
 */
function raiseSniper(weapon: WeaponState, input: WeaponInput, config: GameplayConfig): void {
  weapon.readyLeftS = Math.max(weapon.readyLeftS, config.melee.sniperRaiseS)
  weapon.fireWasHeld = weapon.fireWasHeld || input.fire
  weapon.scopeWasHeld = weapon.scopeWasHeld || input.scope
}

/** Quanto a sniper leva para subir saindo da corrida em que o corpo está. */
function loweredForS(body: Readonly<CharacterState>, config: GameplayConfig): number {
  if (body.tacticalSprinting) return config.weapon.tacticalSprintToFireS
  return body.sprinting ? config.weapon.sprintToFireS : 0
}

export type ArmedMovementInput = {
  -readonly [Key in 'scoped' | 'sprintHeldByWeapon' | 'drawnBlade' | 'dash']: MovementInput[Key]
}

/**
 * O que as armas dizem ao corpo neste tick: a mira (velocidade), a arma
 * pedindo para subir (sem corrida), a lâmina na mão (velocidade) e a investida. Vêm do **estado**, nunca da tecla crua, para o
 * servidor chegar ao mesmo valor.
 *
 * ```ts
 * armMovementInput(arsenal, movementInput)
 * character.stepOnce(movementInput)
 * ```
 */
export function armMovementInput(arsenal: Arsenal, into: ArmedMovementInput): void {
  into.scoped = arsenal.weapon.scoped
  into.sprintHeldByWeapon = weaponHoldsSprint(arsenal.weapon)
  into.drawnBlade = arsenal.melee.bladeDrawn ? arsenal.melee.weapon : null
  into.dash = arsenal.melee.dashedThisTick
}
