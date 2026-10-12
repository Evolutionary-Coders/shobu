#!/usr/bin/env node
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { quantize } from '@gltf-transform/functions'
import { DEFAULT_ARENA_ID } from '../packages/client/src/arena/arenaCatalog.ts'

/**
 * Quantiza as malhas do cenário depois do blender: posição, normal e uv em
 * inteiros de 16 bits (`KHR_mesh_quantization`), em vez de float de 32. O
 * cenário é o maior download do jogo, e no celular, em dados móveis e no wi-fi
 * dividido da feira, cada megabyte é segundo antes de jogar.
 *
 * Quantização, e não meshopt ou draco: o babylon lê `KHR_mesh_quantization`
 * sem decodificador, e os outros dois baixariam um decodificador de fora na
 * hora de jogar.
 *
 * 16 bits na uv bastam para o lightmap de 2048²: são 32 passos por texel.
 *
 *   node scripts/quantize-arena.mjs [glb]   # sem glb, o do mapa padrão
 */
const target =
  process.argv[2] ??
  new URL(`../packages/client/public/assets/arena/${DEFAULT_ARENA_ID}.glb`, import.meta.url)
    .pathname

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const document = await io.read(target)
const before = (await io.writeBinary(document)).byteLength
const blankColours = dropBlankVertexColours(document)
await document.transform(
  quantize({ quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 16, quantizeColor: 8 }),
)
const bytes = await io.writeBinary(document)
await io.write(target, document)
console.log(
  JSON.stringify({
    event: 'arena-quantized',
    target,
    beforeKB: Math.round(before / 1024),
    afterKB: Math.round(bytes.byteLength / 1024),
    blankColours,
  }),
)

/**
 * Tira o `COLOR_0` que é branco do começo ao fim. O blender grava a cor por
 * vértice por malha, não por primitiva: o encardido do chão do Neon-kaidō
 * (`neon_ground.py`) vinha junto em toda primitiva da massa — a fachada
 * inteira levava quatro bytes por vértice de branco, que multiplicado por um
 * não muda nada (12/10). Devolve quantas primitivas perderam a cor.
 */
function dropBlankVertexColours(document) {
  let dropped = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const colour = primitive.getAttribute('COLOR_0')
      if (!colour || !isBlank(colour)) continue
      primitive.setAttribute('COLOR_0', null)
      dropped += 1
    }
  }
  return dropped
}

function isBlank(accessor) {
  const array = accessor.getArray()
  const full = { 5121: 255, 5123: 65535 }[accessor.getComponentType()] ?? 1
  return array.every((value) => value >= full)
}
