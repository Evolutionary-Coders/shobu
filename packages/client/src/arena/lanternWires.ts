/**
 * As lanternas de papel penduradas nos fios que cruzam a rua, como colisão
 * **só do gancho** (ADR 0024): o pedido de 12/10 foi prender a corda na
 * lanterna, e o corpo e a bala passam por ela.
 *
 * É a mesma conta do build do blender (`arena_chinatown.hang_lanterns` e
 * `arena_skin.catenary`): o fio é uma parábola de oito trechos, e as lanternas
 * ficam a cada 1,5 m, uma por vaga, penduradas 35 cm abaixo dele. O teste do
 * mapa confere cada lanterna contra os nós do glb publicado — se o blender
 * mudar a conta e a arte for refeita, é lá que aparece.
 */
import { COLLIDER_GRAPPLE_ONLY } from '@shobu/core'
import { halfTurn, type Vec3 } from './arenaBlock.ts'
import { type PropCollider, propBetween } from './propCollider.ts'

/** Um fio: as duas pontas, em coordenada do jogo, e quanto ele cede no meio. */
export interface LanternWire {
  readonly start: Vec3
  readonly end: Vec3
  readonly sagM: number
}

/** `arena_skin.WIRE_SEGMENTS`. */
const WIRE_SEGMENTS = 8
/** `arena_chinatown.LANTERN_*`: o passo no fio e o barril de papel. */
const LANTERN_PITCH_M = 1.5
const LANTERN_RADIUS_M = 0.32
const LANTERN_HEIGHT_M = 0.5
const LANTERN_DROP_M = 0.35

/**
 * Cada fio e o seu gêmeo girado meia volta, na ordem do blender
 * (`arena_chinatown.all_wires`).
 *
 * ```ts
 * withHalfTurnWires([{ start: [-7, 4.3, 12], end: [7, 8.6, 12], sagM: 0.7 }]).length // 2
 * ```
 */
export function withHalfTurnWires(wires: readonly LanternWire[]): readonly LanternWire[] {
  return wires.flatMap((wire) => [
    wire,
    { start: halfTurn(wire.start), end: halfTurn(wire.end), sagM: wire.sagM },
  ])
}

/**
 * Uma caixa por lanterna, do fundo do barril ao topo dele — o barbante de
 * 35 cm por cima é fino demais para contar.
 *
 * ```ts
 * wireLanterns('lanterna', [{ start: [-7, 4.3, 12], end: [7, 8.6, 12], sagM: 0.7 }]).length // 8
 * ```
 */
export function wireLanterns(
  prefix: string,
  wires: readonly LanternWire[],
): readonly PropCollider[] {
  return wires.flatMap((wire, wireIndex) =>
    lanternPointsOn(wire).map((point, slot) => lanternAt(`${prefix}-${wireIndex}-${slot}`, point)),
  )
}

/** Onde cada lanterna se prende no fio. */
export function lanternPointsOn(wire: LanternWire): readonly Vec3[] {
  const points = catenary(wire)
  const [ax, ay, az] = wire.start
  const [bx, by, bz] = wire.end
  const length = Math.hypot(bx - ax, by - ay, bz - az)
  const count = Math.max(1, Math.floor((length - 1.5) / LANTERN_PITCH_M))
  return Array.from({ length: count }, (_, slot) => pointOn(points, (slot + 1) / (count + 1)))
}

function lanternAt(name: string, [x, y, z]: Vec3): PropCollider {
  const top = y - LANTERN_DROP_M
  const r = LANTERN_RADIUS_M
  return propBetween(
    name,
    COLLIDER_GRAPPLE_ONLY,
    [x - r, top - LANTERN_HEIGHT_M, z - r],
    [x + r, top, z + r],
  )
}

/** O fio como parábola: a olho é igual à catenária, e é o que o blender desenha. */
function catenary({ start, end, sagM }: LanternWire): readonly Vec3[] {
  return Array.from({ length: WIRE_SEGMENTS + 1 }, (_, step) => {
    const t = step / WIRE_SEGMENTS
    const [x, y, z] = lerp(start, end, t)
    return [x, y - 4 * sagM * t * (1 - t), z]
  })
}

/** O ponto a uma fração `t` do fio, entre os pontos da parábola (`arena_chinatown.point_on`). */
function pointOn(points: readonly Vec3[], t: number): Vec3 {
  const scaled = t * (points.length - 1)
  const index = Math.min(Math.floor(scaled), points.length - 2)
  const first = points[index] as Vec3
  const second = points[index + 1] as Vec3
  return lerp(first, second, scaled - index)
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
