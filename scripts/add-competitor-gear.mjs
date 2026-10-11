#!/usr/bin/env node
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune } from '@gltf-transform/functions'

/**
 * Veste o competidor com equipamento: capacete com viseira, placa de peito,
 * mochila, ombreiras e placas de coxa (06/10).
 *
 *   npm run convert:competitor && npm run build:competitor-gear
 *
 * O Mannequin da UAL é um boneco liso, e "editar o personagem" foi o pedido
 * para ele ler como agente cyberpunk e não como manequim de loja. **Nenhuma
 * animação é tocada**: cada peça é uma caixa chanfrada presa com peso 1 a um
 * único joint do skin que já existe, e o glb ganha só uma malha a mais. Passar
 * o personagem inteiro por import e export do blender reamostraria os 22
 * clipes — que é exatamente o que `convert-competitor.mjs` mede e comprime.
 *
 * As peças não têm medida fixa: cada uma é posta pela caixa envolvente dos
 * vértices que o joint dela domina, então elas acompanham o corpo se o
 * personagem trocar. As cores são as duas do Mannequin, repintadas na carga
 * por `paintCompetitor.ts`: placa no corpo escuro, luz na cor do competidor.
 *
 * Idempotente: a malha de equipamento anterior é descartada antes.
 *
 * Espaço do glb: y para cima, frente em +z, a malha sem transformação no nó —
 * é o espaço do bind, e por isso o vértice pode ir direto nele.
 */
const TARGET = new URL('../packages/client/public/assets/character/competitor.glb', import.meta.url)
const GEAR = 'Equipamento'
const BODY = 'M_Main'
const LIGHT = 'M_Joints'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(TARGET.pathname)
const root = doc.getRoot()
dropPreviousGear(root)
const skin = root.listSkins()[0]
const joints = skin.listJoints()
const bounds = boundsByJoint(root, joints)
const pieces = gearPieces(bounds)
const gear = buildGearMesh(doc, pieces, joints)
const node = doc.createNode(GEAR).setMesh(gear).setSkin(skin)
const owner = root.listNodes().find((candidate) => candidate.getMesh() && candidate !== node)
const parent = root.listNodes().find((candidate) => candidate.listChildren().includes(owner))
;(parent ?? root.listScenes()[0]).addChild(node)
await doc.transform(prune())
await io.write(TARGET.pathname, doc)
console.log(
  JSON.stringify({
    event: 'competitor-gear',
    pieces: pieces.length,
    joints: [...new Set(pieces.map((p) => p.joint))],
  }),
)

function dropPreviousGear(rootOfDoc) {
  for (const node of rootOfDoc.listNodes()) {
    if (node.getName() !== GEAR) continue
    node.getMesh()?.dispose()
    node.dispose()
  }
}

/** A caixa envolvente dos vértices de cada joint, pelo joint de maior peso. */
function boundsByJoint(rootOfDoc, skinJoints) {
  const boxes = new Map()
  for (const mesh of rootOfDoc.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) addPrimitiveBounds(primitive, skinJoints, boxes)
  }
  return boxes
}

function addPrimitiveBounds(primitive, skinJoints, boxes) {
  const position = primitive.getAttribute('POSITION')
  const jointIndex = primitive.getAttribute('JOINTS_0')
  const weight = primitive.getAttribute('WEIGHTS_0')
  if (!position || !jointIndex || !weight) return
  for (let vertex = 0; vertex < position.getCount(); vertex += 1) {
    const weights = weight.getElement(vertex, [])
    const strongest = weights.indexOf(Math.max(...weights))
    const name = skinJoints[jointIndex.getElement(vertex, [])[strongest]]?.getName()
    if (!name) continue
    const point = position.getElement(vertex, [])
    const box = boxes.get(name) ?? { min: [...point], max: [...point] }
    for (const axis of [0, 1, 2]) {
      box.min[axis] = Math.min(box.min[axis], point[axis])
      box.max[axis] = Math.max(box.max[axis], point[axis])
    }
    boxes.set(name, box)
  }
}

/**
 * As peças, cada uma `{ joint, material, min, max }` no espaço do glb.
 * Frações da caixa do joint, não metros: é o que deixa a peça no lugar se o
 * corpo mudar.
 */
function gearPieces(boxes) {
  const head = require(boxes, 'Head')
  const chest = require(boxes, 'spine_03')
  const belly = require(boxes, 'spine_02')
  return [
    ...helmet(head),
    ...chestRig(chest),
    ...backpack(chest, belly),
    ...['l', 'r'].flatMap((side) => shoulderPad(require(boxes, `upperarm_${side}`), side)),
    ...['l', 'r'].flatMap((side) => thighPlate(require(boxes, `thigh_${side}`), side)),
  ]
}

function require(boxes, name) {
  const box = boxes.get(name)
  if (!box)
    throw new Error(
      `joint ${name} não domina nenhum vértice; esperado um dos ${[...boxes.keys()].join(', ')}`,
    )
  return box
}

function size(box, axis) {
  return box.max[axis] - box.min[axis]
}

/** O ponto a `fraction` do caminho do mínimo ao máximo da caixa, num eixo. */
function at(box, axis, fraction) {
  return box.min[axis] + size(box, axis) * fraction
}

/** Casco do capacete sobre a metade de cima da cabeça, e a viseira acesa na frente, na altura do olho. */
function helmet(head) {
  const pad = 0.014
  return [
    piece(
      'Head',
      BODY,
      [head.min[0] - pad, at(head, 1, 0.52), head.min[2] - pad],
      [head.max[0] + pad, head.max[1] + pad, head.max[2] + pad],
    ),
    piece(
      'Head',
      LIGHT,
      [at(head, 0, 0.1), at(head, 1, 0.38), head.max[2] - 0.004],
      [at(head, 0, 0.9), at(head, 1, 0.52), head.max[2] + 0.018],
    ),
  ]
}

/** A placa de peito por cima do tronco, com a faixa de luz atravessada. */
function chestRig(chest) {
  return [
    piece(
      'spine_03',
      BODY,
      [at(chest, 0, 0.18), at(chest, 1, 0.2), chest.max[2] - 0.02],
      [at(chest, 0, 0.82), at(chest, 1, 0.85), chest.max[2] + 0.035],
    ),
    piece(
      'spine_03',
      LIGHT,
      [at(chest, 0, 0.3), at(chest, 1, 0.55), chest.max[2] + 0.035],
      [at(chest, 0, 0.7), at(chest, 1, 0.6), chest.max[2] + 0.042],
    ),
  ]
}

/** A mochila nas costas, presa no tronco de cima, com a luz vertical no meio. */
function backpack(chest, belly) {
  const centre = (chest.min[0] + chest.max[0]) / 2
  const low = at(belly, 1, 0.3)
  const high = at(chest, 1, 0.8)
  return [
    piece(
      'spine_03',
      BODY,
      [centre - 0.13, low, chest.min[2] - 0.12],
      [centre + 0.13, high, chest.min[2] + 0.02],
    ),
    piece(
      'spine_03',
      LIGHT,
      [centre - 0.014, low + 0.05, chest.min[2] - 0.128],
      [centre + 0.014, high - 0.05, chest.min[2] - 0.12],
    ),
  ]
}

/** A ombreira cobre o terço do braço que fica junto do ombro, por cima. */
function shoulderPad(arm, side) {
  const towardShoulder =
    side === 'l' ? [arm.min[0], at(arm, 0, 0.38)] : [at(arm, 0, 0.62), arm.max[0]]
  return [
    piece(
      `upperarm_${side}`,
      BODY,
      [towardShoulder[0] - 0.012, at(arm, 1, 0.35), arm.min[2] - 0.018],
      [towardShoulder[1] + 0.012, arm.max[1] + 0.022, arm.max[2] + 0.018],
    ),
  ]
}

/** A placa na face de fora da coxa, com um ponto de luz no alto dela. */
function thighPlate(thigh, side) {
  const outer = side === 'l' ? thigh.max[0] : thigh.min[0]
  const out = side === 'l' ? 1 : -1
  const plate = [outer - out * 0.01, outer + out * 0.03].sort((a, b) => a - b)
  const light = [outer + out * 0.03, outer + out * 0.036].sort((a, b) => a - b)
  return [
    piece(
      `thigh_${side}`,
      BODY,
      [plate[0], at(thigh, 1, 0.4), at(thigh, 2, 0.2)],
      [plate[1], at(thigh, 1, 0.85), at(thigh, 2, 0.8)],
    ),
    piece(
      `thigh_${side}`,
      LIGHT,
      [light[0], at(thigh, 1, 0.7), at(thigh, 2, 0.4)],
      [light[1], at(thigh, 1, 0.78), at(thigh, 2, 0.6)],
    ),
  ]
}

function piece(joint, material, min, max) {
  return { joint, material, min, max }
}

/** Uma primitiva por material, com cada peça presa ao joint dela por peso 1. */
function buildGearMesh(document, gearList, skinJoints) {
  const mesh = document.createMesh(GEAR)
  const buffer = document.getRoot().listBuffers()[0]
  for (const materialName of [BODY, LIGHT]) {
    const material = document
      .getRoot()
      .listMaterials()
      .find((m) => m.getName() === materialName)
    if (!material)
      throw new Error(`material ${materialName} não existe no glb; esperado ${BODY} e ${LIGHT}`)
    const geometry = { position: [], normal: [], joints: [], weights: [] }
    for (const item of gearList.filter((p) => p.material === materialName)) {
      const jointIndex = skinJoints.findIndex((joint) => joint.getName() === item.joint)
      addChamferedBox(geometry, item.min, item.max, jointIndex)
    }
    mesh.addPrimitive(primitiveOf(document, buffer, geometry, material))
  }
  return mesh
}

function primitiveOf(document, buffer, geometry, material) {
  const accessor = (type, array) =>
    document.createAccessor().setType(type).setArray(array).setBuffer(buffer)
  return document
    .createPrimitive()
    .setMaterial(material)
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(geometry.position)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(geometry.normal)))
    .setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array(geometry.joints)))
    .setAttribute('WEIGHTS_0', accessor('VEC4', new Float32Array(geometry.weights)))
}

/**
 * Uma caixa com as quatro arestas verticais chanfradas — oito lados em planta.
 * Caixa reta de canto vivo lia como bloco de lego em cima do mannequin, que é
 * todo curva.
 */
function addChamferedBox(geometry, min, max, jointIndex) {
  const ring = chamferedRing(min, max)
  const centre = [(min[0] + max[0]) / 2, (min[2] + max[2]) / 2]
  for (let index = 0; index < ring.length; index += 1) {
    const edge = { a: ring[index], b: ring[(index + 1) % ring.length] }
    addSide(geometry, edge, min[1], max[1], jointIndex)
    addCap(geometry, centre, edge, max[1], 1, jointIndex)
    addCap(geometry, centre, edge, min[1], -1, jointIndex)
  }
}

/** Os oito cantos em planta (x, z): o retângulo com as quinas cortadas a 22% do lado menor. */
function chamferedRing(min, max) {
  const cut = Math.min(max[0] - min[0], max[2] - min[2]) * 0.22
  return [
    [min[0] + cut, min[2]],
    [max[0] - cut, min[2]],
    [max[0], min[2] + cut],
    [max[0], max[2] - cut],
    [max[0] - cut, max[2]],
    [min[0] + cut, max[2]],
    [min[0], max[2] - cut],
    [min[0], min[2] + cut],
  ]
}

function addSide(geometry, { a, b }, bottom, top, jointIndex) {
  const normal = normalise([b[1] - a[1], 0, -(b[0] - a[0])])
  const corners = [
    [a[0], bottom, a[1]],
    [a[0], top, a[1]],
    [b[0], top, b[1]],
    [b[0], bottom, b[1]],
  ]
  addQuad(geometry, corners, normal, jointIndex)
}

/** Uma fatia da tampa de cima (`up` 1) ou de baixo (`up` -1), do centro à aresta. */
function addCap(geometry, centre, { a, b }, height, up, jointIndex) {
  const corners = [
    [centre[0], height, centre[1]],
    [a[0], height, a[1]],
    [b[0], height, b[1]],
  ]
  addTriangle(geometry, corners, [0, up, 0], jointIndex)
}

function normalise([x, y, z]) {
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

function addQuad(geometry, corners, normal, jointIndex) {
  addTriangle(geometry, [corners[0], corners[1], corners[2]], normal, jointIndex)
  addTriangle(geometry, [corners[0], corners[2], corners[3]], normal, jointIndex)
}

function addTriangle(geometry, corners, normal, jointIndex) {
  for (const corner of orientedTowards(corners, normal)) {
    geometry.position.push(...corner)
    geometry.normal.push(...normal)
    geometry.joints.push(jointIndex, 0, 0, 0)
    geometry.weights.push(1, 0, 0, 0)
  }
}

/** O glTF quer anti-horário visto de fora; acerta a ordem pela normal, e não pela mão de quem escreveu a lista. */
function orientedTowards([a, b, c], normal) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]
  const facing = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2]
  return facing >= 0 ? [a, b, c] : [a, c, b]
}
