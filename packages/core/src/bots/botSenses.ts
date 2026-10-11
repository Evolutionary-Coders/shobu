import { raycastBoxes } from '../collision/raycastBoxes.ts'
import type { StaticBox } from '../collision/staticBox.ts'
import type { Fighter } from '../match/fighter.ts'
import { nextUnit, type SeededRandom } from '../math/seededRandom.ts'
import type { Vector3 } from '../math/vector3.ts'
import type { BotMind } from './botPlayer.ts'

/**
 * Os olhos do bot: quem está à vista, e o relógio de há quanto tempo. É o
 * relógio que a reação e a mira leem — o bot não atira no tick em que vê, e a
 * mira dele começa errando (`botAim.ts`).
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
 * Um tick dos olhos. O alvo que morreu sai na hora; os outros são reavaliados
 * a cada `LOOK_AROUND_INTERVAL_S`, e trocar de alvo zera o relógio e sorteia
 * um erro novo — a mira recomeça.
 *
 * ```ts
 * lookAround(bot.mind, { eyeM: bot.eyeM, selfIndex, fighters, boxes, sightRangeM }, bot.rng, dtS)
 * ```
 */
export function lookAround(mind: BotMind, view: BotView, rng: SeededRandom, dtS: number): void {
  if (mind.targetIndex >= 0 && !(view.fighters[mind.targetIndex] as Fighter).alive) {
    mind.targetIndex = -1
  }
  if (mind.targetIndex >= 0) mind.targetSeenS += dtS
  mind.lookAroundLeftS -= dtS
  if (mind.lookAroundLeftS > 0) return
  mind.lookAroundLeftS = LOOK_AROUND_INTERVAL_S
  const seen = nearestVisibleFoe(view)
  if (seen === mind.targetIndex) return
  mind.targetIndex = seen
  mind.targetSeenS = 0
  sampleAimJitter(mind.aimJitter, rng)
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
