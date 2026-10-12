import { raycastBoxes } from '../collision/raycastBoxes.ts'
import type { StaticBox } from '../collision/staticBox.ts'
import type { BotsConfig } from '../config/gameplayConfig.ts'
import type { Fighter } from '../match/fighter.ts'
import { nextUnit, type SeededRandom } from '../math/seededRandom.ts'
import type { Vector3 } from '../math/vector3.ts'
import type { BotMind, BotPlayer } from './botPlayer.ts'

/**
 * Os olhos do bot: quem está à vista, e o relógio de há quanto tempo. É o
 * relógio que a reação e a mira leem — o bot não atira no tick em que vê, e a
 * mira dele começa errando (`botAim.ts`). E os ouvidos: o tiro que passa perto
 * (`noticeShot`).
 */

/**
 * De quanto em quanto tempo o bot olha em volta. Dez vezes por segundo é o
 * ritmo de quem presta atenção, e corta o custo dos raios de linha de visão
 * para um décimo sem o bot parecer distraído.
 */
export const LOOK_AROUND_INTERVAL_S = 0.1

/**
 * Onde, na cápsula do alvo, o bot procura e mira: o meio do peito. Mirar no
 * centro de massa é o que um jogador faz, e é o que deixa o erro da mira cair
 * ainda dentro do corpo.
 */
export const CHEST_HEIGHT_RATIO = 0.62

/**
 * Um tick dos olhos, e devolve se o bot **acabou de adquirir** um alvo — é a
 * deixa para a mão sortear reação e erro novos (`steadyOnNewTarget`).
 *
 * O alvo que morreu sai na hora; os outros são reavaliados a cada
 * `LOOK_AROUND_INTERVAL_S`, nesta ordem: quem acabou de atirar perto (se o bot
 * o enxerga), o alvo de agora (se ainda está à vista) e, só então, o mais
 * perto. Ficar com quem já está na mira é o que um jogador faz; trocar a cada
 * olhar pelo mais perto fazia o bot reassentar a mira sem parar.
 *
 * **Sem parede transparente**: alvo que sai da linha de visão é perdido no
 * olhar seguinte, e voltar a vê-lo é aquisição nova, com reação e erro do zero.
 *
 * ```ts
 * if (lookAround(bot.mind, view, dtS)) steadyOnNewTarget(bot, hand.skill)
 * ```
 */
export function lookAround(mind: BotMind, view: BotView, dtS: number): boolean {
  if (mind.targetIndex >= 0 && !(view.fighters[mind.targetIndex] as Fighter).alive) {
    mind.targetIndex = -1
  }
  if (mind.targetIndex >= 0) mind.targetSeenS += dtS
  mind.flinchLeftS = Math.max(0, mind.flinchLeftS - dtS)
  mind.lookAroundLeftS -= dtS
  if (mind.lookAroundLeftS > 0) return false
  mind.lookAroundLeftS = LOOK_AROUND_INTERVAL_S
  const seen = chooseTarget(mind, view)
  mind.threatIndex = -1
  if (seen === mind.targetIndex) return false
  mind.targetIndex = seen
  mind.targetSeenS = 0
  return seen >= 0
}

function chooseTarget(mind: BotMind, view: BotView): number {
  if (isVisibleFoe(view, mind.threatIndex)) return mind.threatIndex
  if (isVisibleFoe(view, mind.targetIndex)) return mind.targetIndex
  return nearestVisibleFoe(view)
}

/** O que o bot sabe do mundo ao olhar: de onde, quem ele é, e contra o que o raio bate. */
export interface BotView {
  readonly eyeM: Readonly<Vector3>
  readonly selfIndex: number
  readonly fighters: readonly Fighter[]
  readonly boxes: readonly StaticBox[]
  readonly sightRangeM: number
}

export type MutableBotView = { -readonly [Key in keyof BotView]: BotView[Key] }

/** Um olhar reaproveitado: o bot de cada tick o preenche, e nada aloca por tick. */
export function createBotView(boxes: readonly StaticBox[], sightRangeM: number): MutableBotView {
  return { eyeM: { x: 0, y: 0, z: 0 }, selfIndex: -1, fighters: [], boxes, sightRangeM }
}

/** O inimigo vivo mais perto com o peito à vista, ou -1. */
export function nearestVisibleFoe(view: BotView): number {
  let best = -1
  let bestDistanceSquared = view.sightRangeM * view.sightRangeM
  for (let index = 0; index < view.fighters.length; index += 1) {
    const foe = view.fighters[index] as Fighter
    if (index === view.selfIndex || !foe.alive) continue
    const distanceSquared = chestOffset(view.eyeM, foe, toFoe)
    if (distanceSquared > bestDistanceSquared || !isClear(view, toFoe)) continue
    best = index
    bestDistanceSquared = distanceSquared
  }
  return best
}

/**
 * O combatente `index` é inimigo vivo, dentro do alcance, com o peito à vista.
 * Índice negativo ou fora da lista é "ninguém", e ninguém não está à vista.
 */
export function isVisibleFoe(view: BotView, index: number): boolean {
  const foe = view.fighters[index]
  if (!foe || index === view.selfIndex || !foe.alive) return false
  const rangeSquared = view.sightRangeM * view.sightRangeM
  return chestOffset(view.eyeM, foe, toFoe) <= rangeSquared && isClear(view, toFoe)
}

// o raio do olho ao peito, reaproveitado: olhar em volta roda por tick.
const toFoe: Vector3 = { x: 0, y: 0, z: 0 }

/**
 * Escreve em `out` o vetor do olho ao peito do alvo e devolve o quadrado do
 * comprimento. É o que a busca compara e o que o raio de visão percorre.
 */
export function chestOffset(eyeM: Readonly<Vector3>, foe: Fighter, out: Vector3): number {
  out.x = foe.body.position.x - eyeM.x
  out.y = foe.body.position.y + foe.body.capsuleHeightM * CHEST_HEIGHT_RATIO - eyeM.y
  out.z = foe.body.position.z - eyeM.z
  return out.x * out.x + out.y * out.y + out.z * out.z
}

/**
 * Linha de visão livre: o raio não bate em caixa antes de chegar ao peito.
 * Direção **sem** normalizar e alcance 1 — o `t` do raio é então a fração do
 * caminho, e qualquer acerto abaixo de 1 é parede no meio.
 */
function isClear(view: BotView, offset: Readonly<Vector3>): boolean {
  return raycastBoxes(view.eyeM, offset, view.boxes, 1) === undefined
}

/**
 * Um ponto uniforme na bola de raio 1, por rejeição: sem trigonometria, como
 * a dispersão do tiro (`aimSpread.ts`). Desistindo, fica no centro — mira sem
 * erro, que é raríssima e inofensiva.
 */
export function sampleAimJitter(out: Vector3, rng: SeededRandom): Vector3 {
  for (let draw = 0; draw < MAX_BALL_DRAWS; draw += 1) {
    out.x = nextUnit(rng) * 2 - 1
    out.y = nextUnit(rng) * 2 - 1
    out.z = nextUnit(rng) * 2 - 1
    if (out.x * out.x + out.y * out.y + out.z * out.z <= 1) return out
  }
  out.x = 0
  out.y = 0
  out.z = 0
  return out
}

/** A bola ocupa ~52 % do cubo: oito tiradas falham juntas uma vez em ~380 sementes. */
const MAX_BALL_DRAWS = 8

/** Um tiro que acabou de cruzar a arena: quem atirou, de onde e até onde o raio foi. */
export interface PassingShot {
  readonly shooterIndex: number
  readonly fromM: Readonly<Vector3>
  readonly toM: Readonly<Vector3>
}

/**
 * Os ouvidos do bot: o tiro que passa a menos de `bots.nearMissM` do peito
 * dele é quase-tiro. Ele se assusta (a mira treme por `bots.flinchS`) e olha
 * em volta **já**, procurando o atirador primeiro — mas só mira nele se o
 * enxergar (`lookAround`): ouvir o tiro não dá parede transparente. Devolve se
 * o tiro passou perto.
 *
 * ```ts
 * noticeShot(bot, botIndex + 1, { shooterIndex, fromM: eyeM, toM: shot.endpointM }, config.bots)
 * ```
 */
export function noticeShot(
  bot: BotPlayer,
  selfIndex: number,
  shot: PassingShot,
  bots: BotsConfig,
): boolean {
  if (!bot.alive || shot.shooterIndex === selfIndex) return false
  const { position, capsuleHeightM } = bot.body
  const chestY = position.y + capsuleHeightM * CHEST_HEIGHT_RATIO
  const missSquared = distanceToSegmentSquared(position.x, chestY, position.z, shot)
  if (missSquared > bots.nearMissM * bots.nearMissM) return false
  bot.mind.threatIndex = shot.shooterIndex
  bot.mind.lookAroundLeftS = 0
  bot.mind.flinchLeftS = bots.flinchS
  return true
}

/** O quadrado da distância do ponto ao trecho do raio, sem alocar: é chamado por tiro e por bot. */
function distanceToSegmentSquared(x: number, y: number, z: number, shot: PassingShot): number {
  const { fromM, toM } = shot
  const dx = toM.x - fromM.x
  const dy = toM.y - fromM.y
  const dz = toM.z - fromM.z
  const lengthSquared = dx * dx + dy * dy + dz * dz
  const along = (x - fromM.x) * dx + (y - fromM.y) * dy + (z - fromM.z) * dz
  const t = lengthSquared > 0 ? Math.min(1, Math.max(0, along / lengthSquared)) : 0
  const ox = fromM.x + dx * t - x
  const oy = fromM.y + dy * t - y
  const oz = fromM.z + dz * t - z
  return ox * ox + oy * oy + oz * oz
}
