import type { BotsConfig, GameplayConfig } from '../config/gameplayConfig.ts'
import type { Fighter } from '../match/fighter.ts'
import { addScaled, normalizeInPlace } from '../math/vector3.ts'
import { spreadTangent } from '../weapon/spreadTangent.ts'
import { canFire, isExactShot, isReloading } from '../weapon/weaponState.ts'
import type { BotPlayer } from './botPlayer.ts'
import { chestOffset } from './botSenses.ts'

/**
 * A mão do bot: para onde ele mira e quando aperta. É aqui que mora a
 * dificuldade (ADR 0016) — o tiro em si é o do jogador, com o mesmo cone e o
 * mesmo ferrolho, e o que o bot erra é **onde** põe a mira.
 *
 * A mira converge: no instante em que o alvo aparece ela erra
 * `bots.aimErrorDeg`, e em `bots.aimSettleS` desce em linha reta até
 * `bots.aimResidualDeg`. Linear e não exponencial porque `Math.exp` também não
 * tem o último bit garantido entre motores (ADR 0003), e uma reta é tão
 * convincente quanto uma curva para quem está do outro lado da luneta.
 */
export interface BotAimTangents {
  readonly arrival: number
  readonly residual: number
}

/**
 * As tangentes dos dois erros, uma vez por carga de configuração — é o mesmo
 * desenho do cone do tiro (`spreadTangent.ts`), e pelo mesmo motivo.
 *
 * ```ts
 * const tangents = botAimTangents(config.bots)
 * ```
 */
export function botAimTangents(bots: BotsConfig): BotAimTangents {
  return { arrival: spreadTangent(bots.aimErrorDeg), residual: spreadTangent(bots.aimResidualDeg) }
}

/** O erro da mira agora, como tangente: do de chegada ao residual, em linha reta. */
export function aimErrorTangent(seenS: number, tangents: BotAimTangents, bots: BotsConfig): number {
  const remaining = Math.max(0, 1 - seenS / bots.aimSettleS)
  return tangents.residual + (tangents.arrival - tangents.residual) * remaining
}

/**
 * Mira no peito do alvo, desviada pelo erro de agora, e devolve a distância.
 * O desvio é a bola de erro do bot vezes a distância vezes a tangente — o
 * mesmo ângulo de erro de perto e de longe, como o de uma mão.
 *
 * ```ts
 * const distanceM = aimAtFoe(bot, foe, tangents, config.bots)
 * ```
 */
export function aimAtFoe(
  bot: BotPlayer,
  foe: Fighter,
  tangents: BotAimTangents,
  bots: BotsConfig,
): number {
  const distanceM = Math.sqrt(chestOffset(bot.eyeM, foe, bot.aimM))
  const error = distanceM * aimErrorTangent(bot.mind.targetSeenS, tangents, bots)
  addScaled(bot.aimM, bot.mind.aimJitter, error)
  normalizeInPlace(bot.aimM)
  return distanceM
}

/**
 * Sem alvo, o bot olha para onde anda, no plano. Parado, continua olhando
 * para onde olhava — virar para o norte toda vez que para leria como defeito.
 */
export function aimAlongStride(bot: BotPlayer): void {
  const { wishX, wishZ } = bot.movementInput
  if (wishX === 0 && wishZ === 0) return
  bot.aimM.x = wishX
  bot.aimM.y = 0
  bot.aimM.z = wishZ
  normalizeInPlace(bot.aimM)
}

/** O que a mão precisa saber do alvo para decidir os três botões. */
export interface TriggerSight {
  /** Distância até o alvo, ou `Infinity` sem alvo. */
  readonly distanceM: number
  readonly hostile: boolean
}

/**
 * Os três botões da arma, com a borda que a arma exige: tecla presa no tick
 * anterior não dispara de novo (`stepWeapon`), então o bot solta antes de
 * apertar, como um dedo.
 *
 * - **luneta**: aberta além de `bots.scopeBeyondM`, fechada aquém. É
 *   interruptor, então o bot aperta só quando o estado não é o que ele quer.
 * - **gatilho**: depois do tempo de reação, com a arma pronta e, se a luneta
 *   for pedida, com ela assentada — o tiro exato do jogador, com a mesma
 *   espera.
 * - **recarga**: sem alvo e com o pente incompleto, para não ser pego vazio.
 *
 * ```ts
 * pullTriggers(bot, { distanceM, hostile: true }, config)
 * ```
 */
export function pullTriggers(bot: BotPlayer, sight: TriggerSight, config: GameplayConfig): void {
  const { weapon, weaponInput } = bot
  const engaged = sight.hostile && sight.distanceM < Number.POSITIVE_INFINITY
  const wantsScope = engaged && sight.distanceM > config.bots.scopeBeyondM
  weaponInput.scope = wantsScope !== weapon.scoped && !weapon.scopeWasHeld
  weaponInput.fire = engaged && isReadyToFire(bot, wantsScope, config) && !weapon.fireWasHeld
  weaponInput.reload = !engaged && wantsTopUp(bot, config) && !weapon.reloadWasHeld
}

function isReadyToFire(bot: BotPlayer, wantsScope: boolean, config: GameplayConfig): boolean {
  if (bot.mind.targetSeenS < config.bots.reactionS || !canFire(bot.weapon)) return false
  return wantsScope ? isExactShot(bot.weapon, config) : !bot.weapon.scoped
}

function wantsTopUp(bot: BotPlayer, config: GameplayConfig): boolean {
  return bot.weapon.roundsInMagazine < config.weapon.magazineRounds && !isReloading(bot.weapon)
}
