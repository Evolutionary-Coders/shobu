import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { CharacterState } from '../movement/characterState.ts'
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
 * stepArsenal({ weapon, melee }, weaponInput, character.current, config, dtS)
 * ```
 */
export function stepArsenal(
  arsenal: Arsenal,
  input: WeaponInput,
  body: Readonly<CharacterState>,
  config: GameplayConfig,
  dtS: number,
): void {
  const { weapon, melee } = arsenal
  const wasDrawn = melee.bladeDrawn
  stepMelee(melee, input, body.grounded, config, dtS)
  if (wasDrawn && !melee.bladeDrawn) {
    weapon.readyLeftS = Math.max(weapon.readyLeftS, config.melee.sniperRaiseS)
  }
  weapon.holstered = melee.bladeDrawn
  if (melee.struckThisTick) closeScope(weapon)
  stepWeapon(weapon, input, config, dtS, loweredForS(body, config))
}

/** Quanto a sniper leva para subir saindo da corrida em que o corpo está. */
function loweredForS(body: Readonly<CharacterState>, config: GameplayConfig): number {
  if (body.tacticalSprinting) return config.weapon.tacticalSprintToFireS
  return body.sprinting ? config.weapon.sprintToFireS : 0
}

export type ArmedMovementInput = {
  -readonly [Key in 'scoped' | 'sprintHeldByWeapon' | 'bladeDrawn' | 'dash']: MovementInput[Key]
}

/**
 * O que as armas dizem ao corpo neste tick: a mira (velocidade), a arma
 * pedindo para subir (sem corrida), a katana na mão (bônus) e a investida. Vêm do **estado**, nunca da tecla crua, para o
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
  into.bladeDrawn = arsenal.melee.bladeDrawn
  into.dash = arsenal.melee.dashedThisTick
}
