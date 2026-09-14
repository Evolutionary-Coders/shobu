#!/usr/bin/env node
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, join, prune, quantize, weld } from '@gltf-transform/functions'

/**
 * Converte a cidade cyberpunk do Sketchfab no quarteirão de fundo da arena,
 * em `assets/maps/`:
 *
 *   node scripts/convert-skyline.mjs
 *
 * **Por que este asset e não os outros dois.** Dos três cenários baixados, é o
 * único que chega sem textura nenhuma: 30 materiais de cor chapada, 64 mil
 * triângulos, 4,4 MB. Os outros dois somam 190 MB de PBR em 2048 a 8192 px, e
 * a ADR 0004 proíbe PBR — achatá-los jogaria fora justamente o que os faz
 * bonitos. Aqui não há nada para jogar fora.
 *
 * **Dois materiais, não trinta.** As cores viram `COLOR_0` por vértice e os 30
 * materiais colapsam em dois, separados pelo que o `emissiveFactor` do original
 * diz: estrutura (concreto e vidro, que a luz da arena ilumina) e neon (janela
 * acesa e letreiro, que brilham sozinhos). Com isso o `join()` funde as 30
 * primitivas em duas, e o quarteirão inteiro custa dois draw calls em vez de
 * trinta — o que o nfr.md pede de cenário estático.
 *
 * O `TEXCOORD_0` vai embora junto: o original não tem uma textura sequer, e o
 * uv é 1,3 MB de peso morto.
 */
const SOURCE = new URL('../assets/maps/black-cyberpunk_city_-_1.glb', import.meta.url)
const TARGET = new URL('../packages/client/public/assets/arena/skyline.glb', import.meta.url)

/**
 * Acima disto o material do original é letreiro ou janela acesa, e não
 * estrutura. Os 30 materiais se separam limpo: oito passam de 1,0 na soma dos
 * canais (branco, ciano, magenta, verde, dois vermelhos, laranja e rosa) e os
 * outros 22 têm emissivo exatamente zero — não há caso de fronteira para
 * calibrar.
 */
const NEON_EMISSIVE_SUM = 0.01

/** Coluna-maior, a convenção de matriz do glTF. */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

const STRUCTURE_MATERIAL = 'skyline-structure'
const NEON_MATERIAL = 'skyline-neon'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(SOURCE.pathname)

const structure = createFlatMaterial(doc, STRUCTURE_MATERIAL, [0, 0, 0])
const neon = createFlatMaterial(doc, NEON_MATERIAL, [1, 1, 1])
for (const mesh of doc.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    bakeMaterialColorIntoVertices(doc, primitive)
    primitive.setMaterial(isNeon(primitive.getMaterial()) ? neon : structure)
    primitive.setAttribute('TEXCOORD_0', null)
  }
}

// `flatten` antes de `join`: o glb do sketchfab tem quatro níveis de nó, e o
// join só funde o que estiver irmão na mesma cena. `quantize` por último, e é
// ele que faz a diferença de peso: 113 mil vértices a 12 bytes de posição e 12
// de normal são 2,7 MB, e em 14 e 10 bits caem para menos de um terço. A perda
// é de 0,56 mm na malha do quarteirão — 3 cm depois da escala 60×, num prédio
// que o jogador vê a 40 m de distância no mínimo.
await doc.transform(flatten(), join({ keepNamed: false }), weld(), prune(), dedup())
// medido **antes** de quantizar: depois a posição está em inteiro de 14 bits e
// a escala de volta mora no nó, e ler o accessor daria as unidades cruas.
const bounds = worldBounds(doc)
await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10 }))
await io.write(TARGET.pathname, doc)
report(doc, bounds)

/**
 * Um material do standard do babylon depois: sem pbr, sem textura, cor vinda
 * do vértice.
 *
 * O `emissiveFactor` do neon não é decoração: os dois materiais são idênticos
 * em todo o resto, e sem ele o `dedup()` funde os dois num só — media, o glb
 * saía com um material e o cliente perdia de vista quem ignora a luz da arena.
 * É também a marca que `loadArenaSkyline.ts` lê para decidir isso.
 */
function createFlatMaterial(doc, name, emissive) {
  return doc
    .createMaterial(name)
    .setBaseColorFactor([1, 1, 1, 1])
    .setEmissiveFactor(emissive)
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
}

function isNeon(material) {
  if (!material) return false
  const emissive = material.getEmissiveFactor()
  return emissive[0] + emissive[1] + emissive[2] > NEON_EMISSIVE_SUM
}

/**
 * Escreve a cor do material em todo vértice da primitiva. É o que permite
 * fundir trinta materiais em dois sem perder a paleta.
 *
 * A cor do neon vem do `emissiveFactor` e a da estrutura do `baseColorFactor`,
 * porque no original todo material emissivo tem base branca — a cor dele mora
 * só no emissivo, e ler a base daria oito letreiros brancos.
 *
 * Byte normalizado e não float: são 113 mil vértices, e a diferença entre 16 e
 * 4 bytes por cor é 1,4 MB num arquivo que compete pelos cinco segundos do
 * pilar 2. Um canal de cor não tem 24 bits de informação para perder.
 */
function bakeMaterialColorIntoVertices(doc, primitive) {
  const material = primitive.getMaterial()
  const color = isNeon(material)
    ? [...material.getEmissiveFactor(), 1]
    : (material?.getBaseColorFactor() ?? [1, 1, 1, 1])
  const count = primitive.getAttribute('POSITION').getCount()
  const bytes = color.map((channel) => Math.round(channel * 255))
  const array = new Uint8Array(count * 4)
  for (let vertex = 0; vertex < count; vertex++) array.set(bytes, vertex * 4)
  primitive.setAttribute(
    'COLOR_0',
    doc
      .createAccessor()
      .setType('VEC4')
      .setArray(array)
      .setNormalized(true)
      .setBuffer(doc.getRoot().listBuffers()[0]),
  )
}

function report(doc, bounds) {
  const root = doc.getRoot()
  const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives())
  console.log(
    JSON.stringify({
      target: TARGET.pathname,
      meshes: root.listMeshes().length,
      drawCalls: primitives.length,
      materials: root.listMaterials().map((material) => material.getName()),
      triangles: primitives.reduce(
        (total, primitive) => total + primitive.getIndices().getCount() / 3,
        0,
      ),
      vertices: primitives.reduce(
        (total, primitive) => total + primitive.getAttribute('POSITION').getCount(),
        0,
      ),
      blockSizeM: bounds.size.map((value) => Number(value.toFixed(2))),
      groundY: Number(bounds.min[1].toFixed(3)),
    }),
  )
}

/**
 * O tamanho do quarteirão **como o cliente vai vê-lo**, com a matriz dos nós
 * aplicada. Ler só o min/max dos accessors daria as unidades cruas do
 * sketchfab (1350 × 1299 × 457), e é a medida com transformação que
 * `skylineRing.ts` usa para calcular escala e raio do anel.
 */
function worldBounds(doc) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY]
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  const visit = (node, parent) => {
    const world = multiply(parent, node.getMatrix())
    const mesh = node.getMesh()
    for (const primitive of mesh ? mesh.listPrimitives() : []) {
      growByCorners(min, max, primitive.getAttribute('POSITION'), world)
    }
    for (const child of node.listChildren()) visit(child, world)
  }
  for (const node of doc.getRoot().getDefaultScene().listChildren()) visit(node, IDENTITY)
  return { min, max, size: max.map((value, axis) => value - min[axis]) }
}

function multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k]
    }
  }
  return out
}

/** Os oito cantos, porque a rotação do nó não preserva um par min/max. */
function growByCorners(min, max, position, world) {
  const low = position.getMin([])
  const high = position.getMax([])
  for (let corner = 0; corner < 8; corner++) {
    const local = [0, 1, 2].map((axis) => ((corner >> axis) & 1 ? high : low)[axis])
    for (const [axis, value] of transform(world, local).entries()) {
      min[axis] = Math.min(min[axis], value)
      max[axis] = Math.max(max[axis], value)
    }
  }
}

function transform(m, p) {
  return [0, 1, 2].map(
    (axis) => m[axis] * p[0] + m[4 + axis] * p[1] + m[8 + axis] * p[2] + m[12 + axis],
  )
}
