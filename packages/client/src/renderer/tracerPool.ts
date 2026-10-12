import { raycastBoxes, type StaticBox, type Vector3 } from '@shobu/core'

/**
 * Os feixes de laser vivos, em slots pré-alocados.
 *
 * O rastro é **informação de gameplay**, não enfeite: é a única pista de onde
 * veio um tiro que não matou (modelo de simulação). Por isso ele dura o que o
 * `weapon.tracerLifetimeS` manda, e não o que fica bonito.
 */
export interface TracerSlot {
  /** Segundos restantes; 0 é livre. */
  remainingS: number
  startX: number
  startY: number
  startZ: number
  endX: number
  endY: number
  endZ: number
}

export interface TracerPool {
  readonly slots: readonly TracerSlot[]
  /** Próximo slot a usar, em rodízio. */
  next: number
  readonly lifetimeS: number
}

export function createTracerPool(size: number, lifetimeS: number): TracerPool {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`size recebeu ${size}; esperado inteiro >= 1`)
  }
  if (!(lifetimeS > 0)) {
    throw new RangeError(`lifetimeS recebeu ${lifetimeS}; esperado número > 0`)
  }
  return {
    slots: Array.from({ length: size }, () => ({
      remainingS: 0,
      startX: 0,
      startY: 0,
      startZ: 0,
      endX: 0,
      endY: 0,
      endZ: 0,
    })),
    next: 0,
    lifetimeS,
  }
}

/**
 * Acende um feixe do cano até o ponto de impacto e devolve o índice do slot.
 *
 * Em rodízio: com a piscina cheia o tiro novo rouba o slot mais velho. Um
 * ferrolho dispara menos de uma vez por segundo, então na prática ela nunca
 * enche — oito jogadores atirando juntos, sim.
 *
 * ```ts
 * fireTracer(pool, muzzleM, shot.endpointM)
 * ```
 */
export function fireTracer(
  pool: TracerPool,
  fromM: Readonly<Vector3>,
  toM: Readonly<Vector3>,
): number {
  const index = pool.next
  const slot = pool.slots[index]
  if (!slot) throw new RangeError(`a piscina de rastros está vazia; esperado ao menos um slot`)
  slot.startX = fromM.x
  slot.startY = fromM.y
  slot.startZ = fromM.z
  slot.endX = toM.x
  slot.endY = toM.y
  slot.endZ = toM.z
  slot.remainingS = pool.lifetimeS
  pool.next = (index + 1) % pool.slots.length
  return index
}

/**
 * Muda o começo de um feixe aceso. É o do jogador: o coice levanta a arma no
 * quadro seguinte ao tiro, e um feixe preso ao ponto em que o cano **estava**
 * nascia solto, um palmo abaixo do cano desenhado. O fim não mexe — é onde a
 * bala bateu.
 *
 * ```ts
 * moveTracerStart(pool, index, muzzleM)
 * ```
 */
export function moveTracerStart(pool: TracerPool, index: number, fromM: Readonly<Vector3>): void {
  const slot = pool.slots[index]
  if (!slot)
    throw new RangeError(`index recebeu ${index}; esperado slot de 0 a ${pool.slots.length - 1}`)
  slot.startX = fromM.x
  slot.startY = fromM.y
  slot.startZ = fromM.z
}

export function advanceTracers(pool: TracerPool, dtS: number): void {
  if (!Number.isFinite(dtS) || dtS < 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado tempo de quadro finito >= 0`)
  }
  for (const slot of pool.slots) {
    if (slot.remainingS > 0) slot.remainingS = Math.max(0, slot.remainingS - dtS)
  }
}

/**
 * 1 recém-disparado, 0 apagado. É o que vira a visibilidade da malha.
 *
 * **Quadrático, não linear**: um rastro que some em rampa reta lê como faixa
 * pendurada no ar. Ao quadrado ele cai rápido e some devagar, que é o desenho
 * de um clarão — o olho vê o estouro e depois a fumaça.
 */
export function tracerOpacity(slot: Readonly<TracerSlot>, lifetimeS: number): number {
  if (slot.remainingS <= 0) return 0
  const left = Math.min(1, slot.remainingS / lifetimeS)
  return left * left
}

/**
 * O núcleo branco vive só o primeiro quinto da vida do rastro.
 *
 * É o que separa um feixe de um cilindro pintado: **duas coisas com tempos
 * diferentes**. O núcleo é o tiro, e pisca; o halo é o ar quente atrás dele, e
 * fica um pouco mais. Uma coisa só, com uma cor só e um tempo só, é o que
 * parecia amador.
 */
export const TRACER_CORE_FRACTION = 0.2

export function tracerCoreOpacity(slot: Readonly<TracerSlot>, lifetimeS: number): number {
  if (slot.remainingS <= 0) return 0
  const coreLifeS = lifetimeS * TRACER_CORE_FRACTION
  const left = slot.remainingS - (lifetimeS - coreLifeS)
  if (left <= 0) return 0
  return Math.min(1, left / coreLifeS)
}

/**
 * Quanto o estouro do impacto está aceso. Vive menos que o núcleo: é um
 * quadro e meio de clarão no ponto em que a bala bateu, e é o que dá a
 * sensação de a bala ter **chegado** em algum lugar.
 */
export const TRACER_FLASH_FRACTION = 0.12

export function tracerFlashOpacity(slot: Readonly<TracerSlot>, lifetimeS: number): number {
  if (slot.remainingS <= 0) return 0
  const flashLifeS = lifetimeS * TRACER_FLASH_FRACTION
  const left = slot.remainingS - (lifetimeS - flashLifeS)
  if (left <= 0) return 0
  return Math.min(1, left / flashLifeS)
}

/**
 * A cabeça do feixe atravessa do cano ao impacto no primeiro terço da vida
 * dele. O tiro é hitscan e chegou no tick em que saiu (modelo de simulação);
 * a cabeça é o desenho disso, e é o que separa um feixe que **viaja** de um
 * traço que só aparece. Rápida o bastante para não sugerir tempo de voo.
 */
export const TRACER_HEAD_FRACTION = 0.35

/**
 * Onde a cabeça está, de 0 no cano a 1 no impacto, ou -1 quando ela já
 * chegou (ou o slot está livre) e não há o que desenhar.
 *
 * ```ts
 * tracerHeadProgress(slot, 0.25) // 0 no quadro do disparo
 * ```
 */
export function tracerHeadProgress(slot: Readonly<TracerSlot>, lifetimeS: number): number {
  if (slot.remainingS <= 0) return -1
  const travelS = lifetimeS * TRACER_HEAD_FRACTION
  const progress = (lifetimeS - slot.remainingS) / travelS
  return progress >= 1 ? -1 : Math.max(0, progress)
}

/** A largura mínima do halo, no fim da vida: o rastro afina enquanto some. */
export const TRACER_TAIL_WIDTH = 0.35

/**
 * Quanto da largura do halo sobra: 1 no disparo, `TRACER_TAIL_WIDTH` no fim.
 * O feixe afina **e** esmaece — esmaecer só, com a mesma largura, é a faixa
 * pendurada no ar que `tracerOpacity` já evita.
 */
export function tracerWidthScale(slot: Readonly<TracerSlot>, lifetimeS: number): number {
  const left = Math.min(1, Math.max(0, slot.remainingS / lifetimeS))
  return TRACER_TAIL_WIDTH + (1 - TRACER_TAIL_WIDTH) * left
}

/**
 * Onde o feixe termina quando não há alvo: a primeira parede no caminho, ou o
 * alcance da arma. É o mesmo raio do núcleo, contra a mesma geometria.
 */
export function beamLengthM(
  originM: Readonly<Vector3>,
  direction: Readonly<Vector3>,
  boxes: readonly StaticBox[],
  rangeM: number,
): number {
  return raycastBoxes(originM, direction, boxes, rangeM) ?? rangeM
}
