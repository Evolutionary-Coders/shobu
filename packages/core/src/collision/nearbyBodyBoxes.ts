import { STOPS_BODY, stopsAny } from './colliderMask.ts'
import type { StaticBox } from './staticBox.ts'

/**
 * A fase larga da varredura do corpo: as caixas que o corpo **pode** tocar
 * neste tick, separadas da arena inteira numa passada só.
 *
 * Sem ela, cada sub-passo de cada eixo testava todas as caixas do mapa: com as
 * 276 lanternas do Ichiban-gai o tick do núcleo foi de 67 para 122 µs
 * (medido em 12/10), e quase tudo era `overlaps` contra caixa do outro lado do
 * mapa. Uma passada barata — um teste de faixa por eixo — devolve a dúzia que
 * importa, e os sub-passos rodam só nelas.
 *
 * O volume é **folgado**, nunca justo: tudo o que a resolução pode fazer com o
 * corpo — andar o deslocamento do tick, subir um degrau, sondar o chão — fica
 * dentro dele. Caixa a mais não muda o resultado; caixa a menos mudaria.
 *
 * Sem alocação: a lista é do módulo e é reescrita a cada chamada. Quem a usa
 * termina antes da próxima chamada (a varredura não é reentrante).
 */

/** Quanto a mais em volta do volume: muito acima do erro de ponto flutuante, muito abaixo de uma caixa. */
const SLACK_M = 0.1

export interface BodyReach {
  readonly x: number
  readonly y: number
  readonly z: number
  /** O deslocamento do tick inteiro, antes da colisão. */
  readonly dx: number
  readonly dy: number
  readonly dz: number
  readonly radiusM: number
  /** A altura da cápsula mais o degrau que a resolução pode subir. */
  readonly reachUpM: number
  /** O quanto abaixo do pé a sondagem de chão olha. */
  readonly reachDownM: number
}

const nearby: StaticBox[] = []
const reachWindow = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }

/**
 * ```ts
 * const candidates = nearbyBodyBoxes(boxes, reach) // reaproveitada: use antes da próxima chamada
 * ```
 */
export function nearbyBodyBoxes(
  boxes: readonly StaticBox[],
  reach: Readonly<BodyReach>,
): readonly StaticBox[] {
  frameWindow(reach)
  nearby.length = 0
  for (const box of boxes) {
    if (stopsAny(box.mask, STOPS_BODY) && touchesWindow(box)) nearby.push(box)
  }
  return nearby
}

function frameWindow(reach: Readonly<BodyReach>): void {
  const side = reach.radiusM + SLACK_M
  reachWindow.minX = Math.min(reach.x, reach.x + reach.dx) - side
  reachWindow.maxX = Math.max(reach.x, reach.x + reach.dx) + side
  reachWindow.minY = Math.min(reach.y, reach.y + reach.dy) - reach.reachDownM - SLACK_M
  reachWindow.maxY = Math.max(reach.y, reach.y + reach.dy) + reach.reachUpM + SLACK_M
  reachWindow.minZ = Math.min(reach.z, reach.z + reach.dz) - side
  reachWindow.maxZ = Math.max(reach.z, reach.z + reach.dz) + side
}

function touchesWindow(box: StaticBox): boolean {
  return (
    box.maxX >= reachWindow.minX &&
    box.minX <= reachWindow.maxX &&
    box.maxY >= reachWindow.minY &&
    box.minY <= reachWindow.maxY &&
    box.maxZ >= reachWindow.minZ &&
    box.minZ <= reachWindow.maxZ
  )
}
