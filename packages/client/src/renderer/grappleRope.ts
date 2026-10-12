import type { Vector3 } from '@shobu/core'

/**
 * O cabo do gancho como o jogador o vê: dispara da mão até a âncora, fica
 * esticado enquanto a corda está presa, e recolhe quando ela solta.
 *
 * É **render**: o núcleo engata no tick do aperto, e o cabo que viaja em
 * centésimos de segundo é só o que o olho precisa para ler "disparei, prendeu".
 * Por isso vive aqui, conta com o tempo de quadro, e não muda nada da
 * simulação. A malha fica em `grappleRopeMesh.ts`, que é adapter de engine.
 */
export interface GrappleRope {
  /** 0 é o cabo dentro da mão, 1 é o cabo na âncora. */
  extension: number
  /** O estado do núcleo no último quadro: é a borda que reinicia o disparo. */
  attached: boolean
  /** Onde o cabo prendeu. Guardada para o recolhimento ainda saber de onde volta. */
  readonly anchorM: Vector3
}

/**
 * Seis centésimos: o cabo chega à âncora em menos de quatro quadros a 60 Hz,
 * rápido o bastante para não atrasar a leitura e lento o bastante para se ver
 * viajando. O recolhimento é um pouco mais lento, porque é a deixa de "soltou".
 */
export const ROPE_SHOOT_S = 0.06
export const ROPE_RETRACT_S = 0.1

export function createGrappleRope(): GrappleRope {
  return { extension: 0, attached: false, anchorM: { x: 0, y: 0, z: 0 } }
}

/**
 * Um quadro do cabo. Preso, ele estica; solto, recolhe. Um engate novo — mesmo
 * no meio de um recolhimento — recomeça da mão, porque a âncora é outra.
 *
 * ```ts
 * advanceGrappleRope(rope, state.grappleAttached, state.grappleAnchor, frameS)
 * ```
 */
export function advanceGrappleRope(
  rope: GrappleRope,
  attached: boolean,
  anchorM: Readonly<Vector3>,
  dtS: number,
): void {
  if (!Number.isFinite(dtS) || dtS < 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado tempo de quadro finito >= 0`)
  }
  if (attached && !rope.attached) startShot(rope, anchorM)
  rope.attached = attached
  const step = attached ? dtS / ROPE_SHOOT_S : -dtS / ROPE_RETRACT_S
  rope.extension = Math.min(1, Math.max(0, rope.extension + step))
}

function startShot(rope: GrappleRope, anchorM: Readonly<Vector3>): void {
  rope.extension = 0
  rope.anchorM.x = anchorM.x
  rope.anchorM.y = anchorM.y
  rope.anchorM.z = anchorM.z
}

/** Há cabo para desenhar: disparando, preso ou recolhendo. */
export function isRopeVisible(rope: Readonly<GrappleRope>): boolean {
  return rope.extension > 0
}

/** O marcador da âncora acende quando o cabo chega nela, e só enquanto está preso. */
export function isAnchorMarked(rope: Readonly<GrappleRope>): boolean {
  return rope.attached && rope.extension >= 1
}

/**
 * A ponta do cabo neste quadro, entre a mão e a âncora. Desacelera na chegada
 * (`1 - (1-t)²`): o cabo sai rápido da mão e "crava" na parede, em vez de parar
 * em velocidade constante.
 *
 * ```ts
 * ropeTipM(rope, handM, tip) // tip na âncora com o cabo esticado
 * ```
 */
export function ropeTipM(
  rope: Readonly<GrappleRope>,
  handM: Readonly<Vector3>,
  out: Vector3,
): Vector3 {
  const remaining = 1 - rope.extension
  const eased = 1 - remaining * remaining
  out.x = handM.x + (rope.anchorM.x - handM.x) * eased
  out.y = handM.y + (rope.anchorM.y - handM.y) * eased
  out.z = handM.z + (rope.anchorM.z - handM.z) * eased
  return out
}
