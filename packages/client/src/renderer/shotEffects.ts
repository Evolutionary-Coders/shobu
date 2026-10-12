import { nextUnit, type SeededRandom } from '@shobu/core'

/**
 * A vida dos efeitos do tiro que não são o feixe: o clarão da boca do cano,
 * a faísca e o furo na parede, o acerto no corpo e a fumaça. Tudo em slots
 * pré-alocados, em rodízio, como os feixes (`tracerPool.ts`): o tiro novo
 * rouba o slot mais velho, e nada aloca por disparo nem por quadro.
 *
 * É a parte que roda em node: os adapters (`shotSprites.ts`,
 * `bulletDecals.ts`, `muzzleFlashes.ts`) só copiam estes números para a
 * engine.
 */
export interface EffectSlot {
  /** Segundos desde que acendeu. */
  ageS: number
  /** Quanto vive; 0 é slot livre. */
  lifeS: number
  /** Giro no plano da tela, em radianos: dois clarões seguidos nunca iguais. */
  roll: number
  /** Escala sorteada, em volta de 1. */
  scale: number
}

export interface EffectPool {
  readonly slots: readonly EffectSlot[]
  next: number
}

export function createEffectPool(size: number): EffectPool {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`size recebeu ${size}; esperado inteiro >= 1`)
  }
  return {
    slots: Array.from({ length: size }, () => ({ ageS: 0, lifeS: 0, roll: 0, scale: 1 })),
    next: 0,
  }
}

/** A faixa da escala sorteada: ±15 % já tira a cara de carimbo. */
const SCALE_MIN = 0.85
const SCALE_SPAN = 0.35

/**
 * Acende um slot e devolve o índice. O giro e a escala saem de `random`, um
 * gerador do cliente (`@shobu/core`, sem alocar): é enfeite, e não precisa da
 * semente do tiro — o servidor nunca desenha um clarão.
 *
 * ```ts
 * const index = claimEffect(sparks, WALL_SPARK.lifeS, random)
 * ```
 */
export function claimEffect(pool: EffectPool, lifeS: number, random: SeededRandom): number {
  if (!(lifeS > 0)) throw new RangeError(`lifeS recebeu ${lifeS}; esperado número > 0`)
  const index = pool.next
  const slot = pool.slots[index] as EffectSlot
  slot.ageS = 0
  slot.lifeS = lifeS
  slot.roll = nextUnit(random) * Math.PI * 2
  slot.scale = SCALE_MIN + nextUnit(random) * SCALE_SPAN
  pool.next = (index + 1) % pool.slots.length
  return index
}

/** Todo quadro: envelhece os vivos e libera quem passou da vida. */
export function advanceEffects(pool: EffectPool, dtS: number): void {
  if (!Number.isFinite(dtS) || dtS < 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado tempo de quadro finito >= 0`)
  }
  for (const slot of pool.slots) {
    if (slot.lifeS <= 0) continue
    slot.ageS += dtS
    if (slot.ageS >= slot.lifeS) slot.lifeS = 0
  }
}

export function isLive(slot: Readonly<EffectSlot>): boolean {
  return slot.lifeS > 0
}

/** Como um sprite de estouro se comporta ao longo da vida. */
export interface BurstSpec {
  readonly lifeS: number
  readonly sizeFromM: number
  readonly sizeToM: number
  readonly peakAlpha: number
  /** Metros por segundo para cima: a fumaça sobe, a faísca não. */
  readonly riseMps: number
  /**
   * Fumaça entra suave e sai em rampa; clarão nasce cheio e cai ao quadrado,
   * que é o desenho de um estouro — o olho vê o pico e depois o resto.
   */
  readonly soft: boolean
}

export interface BurstLook {
  sizeM: number
  alpha: number
  riseM: number
}

export function createBurstLook(): BurstLook {
  return { sizeM: 0, alpha: 0, riseM: 0 }
}

/** O pedaço da vida em que a fumaça ainda está aparecendo. */
const SOFT_ATTACK = 0.15

/**
 * O tamanho, a opacidade e a subida do estouro aos `ageS` segundos, em `out`.
 * Cresce rápido e freia (ease-out), que é como uma faísca abre.
 *
 * ```ts
 * burstLook(WALL_SPARK, 0.05, look) // look.alpha ≈ 0,41
 * ```
 */
export function burstLook(spec: BurstSpec, ageS: number, out: BurstLook): BurstLook {
  const t = Math.min(1, Math.max(0, ageS / spec.lifeS))
  const left = 1 - t
  out.sizeM = spec.sizeFromM + (spec.sizeToM - spec.sizeFromM) * (1 - left * left)
  out.alpha = spec.soft
    ? spec.peakAlpha * Math.min(1, t / SOFT_ATTACK) * left
    : spec.peakAlpha * left * left
  out.riseM = spec.riseMps * ageS
  return out
}

/** A faísca na parede: um quadro e meio de luz, pequena. É faísca, não explosão. */
export const WALL_SPARK: BurstSpec = {
  lifeS: 0.14,
  sizeFromM: 0.4,
  sizeToM: 0.95,
  peakAlpha: 1,
  riseMps: 0,
  soft: false,
}

/**
 * O halo em volta da faísca. Largo e fraco: é ele que faz o impacto ler à
 * noite em DESEMPENHO, que não tem passe de glow (ADR 0014).
 */
export const IMPACT_GLOW: BurstSpec = {
  lifeS: 0.12,
  sizeFromM: 0.9,
  sizeToM: 1.3,
  peakAlpha: 0.55,
  riseMps: 0,
  soft: false,
}

/**
 * A brasa no furo: o metal que a bala aqueceu esfria em menos de um
 * segundo. É o que faz o furo ler à noite, quando o furo escuro some na
 * parede escura.
 */
export const WALL_EMBER: BurstSpec = {
  lifeS: 0.9,
  sizeFromM: 0.18,
  sizeToM: 0.1,
  peakAlpha: 0.75,
  riseMps: 0,
  soft: false,
}

/** O pó que a bala arranca do concreto, subindo devagar. */
export const WALL_DUST: BurstSpec = {
  lifeS: 0.6,
  sizeFromM: 0.15,
  sizeToM: 0.55,
  peakAlpha: 0.45,
  riseMps: 0.35,
  soft: true,
}

/** O acerto no corpo: o hexágono ciano, um pouco maior e mais longo que a faísca. */
export const BODY_HIT: BurstSpec = {
  lifeS: 0.25,
  sizeFromM: 0.5,
  sizeToM: 1,
  peakAlpha: 1,
  riseMps: 0,
  soft: false,
}

/** O halo do clarão na boca do cano: a luz no ar, que nenhum `PointLight` precisa pagar. */
export const MUZZLE_GLOW: BurstSpec = {
  lifeS: 0.08,
  sizeFromM: 0.8,
  sizeToM: 1.1,
  peakAlpha: 0.8,
  riseMps: 0,
  soft: false,
}

/** O fiapo de fumaça que fica no cano depois do tiro, por menos de meio segundo. */
export const MUZZLE_SMOKE: BurstSpec = {
  lifeS: 0.45,
  sizeFromM: 0.1,
  sizeToM: 0.45,
  peakAlpha: 0.3,
  riseMps: 0.3,
  soft: true,
}

/** O furo some nos últimos segundos da vida dele, em vez de piscar para fora. */
export const DECAL_FADE_S = 1.5

/**
 * A opacidade do furo de bala: cheia até `DECAL_FADE_S` antes do fim, e em
 * rampa até zero.
 *
 * ```ts
 * decalOpacity({ ageS: 5.5, lifeS: 6, roll: 0, scale: 1 }) // 1/3
 * ```
 */
export function decalOpacity(slot: Readonly<EffectSlot>): number {
  if (!isLive(slot)) return 0
  return Math.min(1, Math.max(0, (slot.lifeS - slot.ageS) / DECAL_FADE_S))
}

/**
 * O quanto o clarão acende. Quem pediu menos movimento no sistema ganha um
 * clarão mais fraco: um estouro branco perto do olho, repetido, é o mesmo
 * incômodo que o balanço de câmera.
 *
 * ```ts
 * flashIntensity(true) // 0,5
 * ```
 */
export function flashIntensity(reducedMotion: boolean): number {
  return reducedMotion ? 0.5 : 1
}
