import { nextUnit, type SeededRandom } from '../math/seededRandom.ts'
import { cross, normalizeInPlace, type Vector3 } from '../math/vector3.ts'

/**
 * Desvia a direção de mira para um ponto **uniforme no disco** de semi-ângulo
 * cuja tangente é `spreadTangent`.
 *
 * Uniforme e não gaussiana porque é essa escolha que decide a confiabilidade
 * do no scope a cada distância, e o level design sai dela (modelo de
 * simulação). Uma gaussiana concentraria os tiros no centro e faria o no scope
 * parecer melhor de perto e pior de longe do que o número diz.
 *
 * **Sem trigonometria nenhuma**: o ponto do disco sai de amostragem por
 * rejeição em [-1,1]², que é uniforme no disco por construção, e a base
 * perpendicular sai de dois produtos vetoriais. É o que permite isto viver no
 * caminho determinístico (ADR 0003).
 *
 * ```ts
 * applySpread(direction, spreadTangent(4.5), rng)
 * ```
 */
export function applySpread(direction: Vector3, spreadTangent: number, rng: SeededRandom): Vector3 {
  if (spreadTangent <= 0) return direction
  const [u, v] = sampleDisk(rng)
  perpendicularBasis(direction)
  direction.x += (right.x * u + up.x * v) * spreadTangent
  direction.y += (right.y * u + up.y * v) * spreadTangent
  direction.z += (right.z * u + up.z * v) * spreadTangent
  return normalizeInPlace(direction)
}

/** Quantas tentativas a amostragem faz antes de desistir e atirar reto. */
const MAX_DISK_DRAWS = 8

/**
 * Um ponto uniforme no disco unitário. Rejeição, não polar: `sqrt` mais dois
 * `Math.cos`/`sin` seria trigonometria no caminho quente, e π/4 de aceitação
 * significa que quase toda tirada passa de primeira.
 */
function sampleDisk(rng: SeededRandom): readonly [number, number] {
  for (let draw = 0; draw < MAX_DISK_DRAWS; draw += 1) {
    const u = nextUnit(rng) * 2 - 1
    const v = nextUnit(rng) * 2 - 1
    if (u * u + v * v <= 1) return [u, v]
  }
  return [0, 0]
}

// dois vetores de módulo: a base perpendicular é recalculada por tiro, e
// alocar dois vetores por tiro é alocação no caminho quente.
const right: Vector3 = { x: 0, y: 0, z: 0 }
const up: Vector3 = { x: 0, y: 0, z: 0 }

/** Vertical do mundo, ou o eixo x quando a mira aponta para ela e o produto degenera. */
const WORLD_UP: Readonly<Vector3> = { x: 0, y: 1, z: 0 }
const FALLBACK_UP: Readonly<Vector3> = { x: 1, y: 0, z: 0 }

function perpendicularBasis(forward: Readonly<Vector3>): void {
  const nearlyVertical = Math.abs(forward.y) > 0.999
  cross(right, forward, nearlyVertical ? FALLBACK_UP : WORLD_UP)
  normalizeInPlace(right)
  cross(up, right, forward)
  normalizeInPlace(up)
}
