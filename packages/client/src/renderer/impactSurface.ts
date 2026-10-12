import {
  type BoxHit,
  createBoxHit,
  nearestBoxHit,
  STOPS_SHOT,
  type StaticBox,
  type Vector3,
} from '@shobu/core'

/**
 * Quanto antes do ponto de impacto o raio de sondagem começa, em metros. O
 * ponto do `resolveShot` está **na** face da caixa; recuar um palmo garante
 * que o raio a cruze de fora, mesmo com o erro de ponto flutuante de um tiro
 * de 400 m.
 */
const PROBE_BACK_M = 0.05

/**
 * A normal da face em que o tiro bateu, escrita em `out`. Devolve se achou
 * parede: falso é tiro que acabou no alcance da arma, no céu, sem nada onde
 * deixar furo.
 *
 * Fica no cliente, e não no `resolveShot` do núcleo, porque só o desenho
 * precisa dela: o furo de bala é enfeite, e o caminho determinístico do tiro
 * não ganha uma conta a mais por isso. As caixas da arena são alinhadas aos
 * eixos (ADR 0003), então a normal é sempre um eixo, com sinal.
 *
 * ```ts
 * if (wallNormalAt(shot.endpointM, shot.directionM, boxes, normal)) decals.stamp(shot.endpointM, normal)
 * ```
 */
export function wallNormalAt(
  endpointM: Readonly<Vector3>,
  directionM: Readonly<Vector3>,
  boxes: readonly StaticBox[],
  out: Vector3,
): boolean {
  probe.x = endpointM.x - directionM.x * PROBE_BACK_M
  probe.y = endpointM.y - directionM.y * PROBE_BACK_M
  probe.z = endpointM.z - directionM.z * PROBE_BACK_M
  if (!nearestBoxHit(probe, directionM, boxes, PROBE_BACK_M * 2, STOPS_SHOT, hit)) return false
  const box = boxes[hit.index] as StaticBox
  nearestFaceNormal(endpointM, box, out)
  return true
}

/** A face da caixa mais perto do ponto: o ponto está nela, a menos de erro de arredondamento. */
function nearestFaceNormal(pointM: Readonly<Vector3>, box: StaticBox, out: Vector3): void {
  faces[0] = pointM.x - box.minX
  faces[1] = box.maxX - pointM.x
  faces[2] = pointM.y - box.minY
  faces[3] = box.maxY - pointM.y
  faces[4] = pointM.z - box.minZ
  faces[5] = box.maxZ - pointM.z
  let nearest = 0
  for (let face = 1; face < faces.length; face += 1) {
    if (Math.abs(faces[face] as number) < Math.abs(faces[nearest] as number)) nearest = face
  }
  const sign = nearest % 2 === 0 ? -1 : 1
  const axis = Math.floor(nearest / 2)
  out.x = axis === 0 ? sign : 0
  out.y = axis === 1 ? sign : 0
  out.z = axis === 2 ? sign : 0
}

// rascunho do módulo: um tiro por quadro, e nada aloca no caminho do disparo.
const probe: Vector3 = { x: 0, y: 0, z: 0 }
const hit: BoxHit = createBoxHit()
/** A distância do ponto às seis faces: menos, mais, em x, y e z. */
const faces = new Float64Array(6)
