import type { BotSkillConfig, GameplayConfig } from '../config/gameplayConfig.ts'
import type { Fighter } from '../match/fighter.ts'
import { nextUnit } from '../math/seededRandom.ts'
import { addScaled, normalizeInPlace, type Vector3 } from '../math/vector3.ts'
import { horizontalSpeed } from '../movement/characterState.ts'
import { spreadTangent } from '../weapon/spreadTangent.ts'
import { canFire, isExactShot, isReloading } from '../weapon/weaponState.ts'
import type { BotPlayer } from './botPlayer.ts'
import { chestOffset, sampleAimJitter } from './botSenses.ts'

/**
 * A mão do bot: para onde ele mira e quando aperta. É aqui que mora a
 * dificuldade (ADR 0016) — o tiro em si é o do jogador, com o mesmo cone e o
 * mesmo ferrolho, e o que o bot erra é **onde** põe a mira.
 *
 * O erro de cada tiro é uma bola em volta do peito do alvo, de raio igual à
 * soma de parcelas que **não** convergem para zero (playtest de 11/10: com um
 * só erro residual de 1°, a 30 m a bola cabia dentro da cápsula e quase todo
 * tiro acertava):
 *
 * - **assentar**: no instante em que vê o alvo a mira erra `aimErrorDeg`, e em
 *   `aimSettleS` desce em linha reta até `aimResidualDeg`. A reação acaba
 *   antes de a mira assentar, então o primeiro tiro sai com mais erro;
 * - **rastrear**: alvo andando de lado soma `trackingLagS` vezes a velocidade
 *   lateral dele, em metros — é a velocidade angular vista pelo bot;
 * - **andar e pular**: o bot em movimento soma `movingErrorDeg`, na proporção
 *   da corrida; no ar, `airborneErrorDeg`;
 * - **susto**: depois de um quase-tiro, `flinchErrorDeg` por `bots.flinchS`.
 *
 * A direção do erro é sorteada de novo a cada tiro (e a cada alvo): o tiro
 * seguinte não herda a sorte do anterior. Linear e não exponencial porque
 * `Math.exp` também não tem o último bit garantido entre motores (ADR 0003).
 */
export interface BotAimTangents {
  readonly arrival: number
  readonly residual: number
  readonly moving: number
  readonly airborne: number
  readonly flinch: number
}

/** Os números do nível e as tangentes deles, juntos: trocar o nível troca os dois. */
export interface BotHand {
  readonly skill: BotSkillConfig
  readonly tangents: BotAimTangents
}

/**
 * A mão de um nível, uma vez por troca de nível — as tangentes saem como as
 * do cone do tiro (`spreadTangent.ts`), e pelo mesmo motivo: trigonometria
 * fora do tick.
 *
 * ```ts
 * const hand = botHandFor(botSkillFor(config, 'normal'))
 * ```
 */
export function botHandFor(skill: BotSkillConfig): BotHand {
  return {
    skill,
    tangents: {
      arrival: spreadTangent(skill.aimErrorDeg),
      residual: spreadTangent(skill.aimResidualDeg),
      moving: spreadTangent(skill.movingErrorDeg),
      airborne: spreadTangent(skill.airborneErrorDeg),
      flinch: spreadTangent(skill.flinchErrorDeg),
    },
  }
}

/**
 * Alvo novo, mão nova: a reação deste alvo e a direção do primeiro erro, ambas
 * sorteadas. Chamada no tick em que `lookAround` adquire alguém.
 *
 * ```ts
 * if (lookAround(bot.mind, view, dtS)) steadyOnNewTarget(bot, hand.skill)
 * ```
 */
export function steadyOnNewTarget(bot: BotPlayer, skill: BotSkillConfig): void {
  bot.mind.reactionS = skill.reactionS + nextUnit(bot.rng) * skill.reactionSpreadS
  sampleAimJitter(bot.mind.aimJitter, bot.rng)
}

/**
 * O tiro saiu: o próximo erra para outro lado. Sem isto a bola era sorteada
 * uma vez por alvo, e uma mira assentada dentro do corpo acertava todos os
 * tiros seguintes.
 */
export function rerollAimAfterShot(bot: BotPlayer): void {
  sampleAimJitter(bot.mind.aimJitter, bot.rng)
}

/** O erro de assentar, como tangente: do de chegada ao residual, em linha reta. */
export function settleTangent(
  seenS: number,
  tangents: BotAimTangents,
  skill: BotSkillConfig,
): number {
  const remaining = Math.max(0, 1 - seenS / skill.aimSettleS)
  return tangents.residual + (tangents.arrival - tangents.residual) * remaining
}

/** O que o corpo do próprio bot soma ao erro: andar, na proporção da corrida, ou estar no ar. */
export function bodyTangent(
  bot: BotPlayer,
  tangents: BotAimTangents,
  config: GameplayConfig,
): number {
  if (!bot.body.grounded) return tangents.airborne
  const stride = Math.min(1, horizontalSpeed(bot.body) / config.movement.runSpeedMps)
  return tangents.moving * stride
}

/**
 * A velocidade do alvo de lado para a linha de visão, em m/s. `lineM` é o
 * vetor do olho ao peito, de comprimento `distanceM`; o que sobra da
 * velocidade tirada a parte ao longo dele é o que o bot precisa rastrear.
 */
export function lateralSpeedMps(foe: Fighter, lineM: Readonly<Vector3>, distanceM: number): number {
  const { x, y, z } = foe.body.velocity
  const speedSquared = x * x + y * y + z * z
  if (distanceM <= 0) return Math.sqrt(speedSquared)
  const along = (x * lineM.x + y * lineM.y + z * lineM.z) / distanceM
  return Math.sqrt(Math.max(0, speedSquared - along * along))
}

/**
 * O raio da bola de erro deste tick, **em metros no alvo**: as parcelas
 * angulares vezes a distância, mais o atraso de rastreio vezes a velocidade
 * lateral (que já é metro).
 */
export function aimErrorM(
  bot: BotPlayer,
  foe: Fighter,
  distanceM: number,
  hand: BotHand,
  config: GameplayConfig,
): number {
  const { tangents, skill } = hand
  const flinch = bot.mind.flinchLeftS > 0 ? tangents.flinch : 0
  const angular =
    settleTangent(bot.mind.targetSeenS, tangents, skill) +
    bodyTangent(bot, tangents, config) +
    flinch
  return distanceM * angular + skill.trackingLagS * lateralSpeedMps(foe, bot.aimM, distanceM)
}

/**
 * Mira no peito do alvo, desviada pela bola de erro deste tick, e devolve a
 * distância.
 *
 * ```ts
 * const distanceM = aimAtFoe(bot, foe, squad.hand, config)
 * ```
 */
export function aimAtFoe(
  bot: BotPlayer,
  foe: Fighter,
  hand: BotHand,
  config: GameplayConfig,
): number {
  const distanceM = Math.sqrt(chestOffset(bot.eyeM, foe, bot.aimM))
  addScaled(bot.aimM, bot.mind.aimJitter, aimErrorM(bot, foe, distanceM, hand, config))
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
 * - **gatilho**: depois da reação sorteada para o alvo (`steadyOnNewTarget`), com a arma pronta e, se a luneta
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
  if (bot.mind.targetSeenS < bot.mind.reactionS || !canFire(bot.weapon)) return false
  return wantsScope ? isExactShot(bot.weapon, config) : !bot.weapon.scoped
}

function wantsTopUp(bot: BotPlayer, config: GameplayConfig): boolean {
  return bot.weapon.roundsInMagazine < config.weapon.magazineRounds && !isReloading(bot.weapon)
}
