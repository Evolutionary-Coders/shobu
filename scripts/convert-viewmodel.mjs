#!/usr/bin/env node
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, TextureResizeFilter, textureCompress } from '@gltf-transform/functions'

/**
 * Converte o viewmodel do sniper (`assets/source/viewmodel/`, CC-BY-4.0 de
 * DJMaesen) para o que a ADR 0004 aceita em `public/assets/`: metro, sem pbr,
 * textura de 256 px. O arquivo de origem não entra no git; este script é o que
 * permite refazer o convertido a partir dele.
 *
 *   node scripts/convert-viewmodel.mjs
 *
 * O que ele faz, e por quê:
 * - **escala 0,01**: o glTF mede 161 unidades no eixo longo — está em
 *   centímetros, e todo número de gameplay é em metro (ADR 0005).
 * - **sem `metallicRoughness` nem `normal`**: a ADR 0004 proíbe pbr; o cliente
 *   troca o material por `StandardMaterial` na carga, e um mapa que ninguém lê
 *   é 4 MB de download contra os cinco segundos do pilar 2.
 * - **texturas em 256 px**: metade da receita do look ps1, e de 2048² para 256²
 *   é 64× menos byte.
 */
const SOURCE = new URL('../assets/source/viewmodel/sniper_animated/scene.gltf', import.meta.url)
const TARGET = new URL('../packages/client/public/assets/viewmodel/sniper.glb', import.meta.url)

const CENTIMETERS_TO_METERS = 0.01
const TEXTURE_SIZE_PX = 256

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const document = await io.read(SOURCE.pathname)

scaleSceneRoots(document, CENTIMETERS_TO_METERS)
stripPbr(document)
await document.transform(
  // sem `encoder`: o gltf-transform cai no codificador em js puro, que basta
  // para redimensionar png. o sharp seria dependência nativa por uma textura.
  textureCompress({
    resize: [TEXTURE_SIZE_PX, TEXTURE_SIZE_PX],
    resizeFilter: TextureResizeFilter.LANCZOS3,
    targetFormat: 'png',
  }),
  dedup(),
  prune(),
)
await io.write(TARGET.pathname, document)
report(document)

function scaleSceneRoots(doc, factor) {
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) {
      node.setScale(node.getScale().map((axis) => axis * factor))
    }
  }
}

/** Fica só a cor de base: é o único mapa que o `StandardMaterial` vai ler. */
function stripPbr(doc) {
  for (const material of doc.getRoot().listMaterials()) {
    material.setMetallicRoughnessTexture(null)
    material.setNormalTexture(null)
    material.setOcclusionTexture(null)
    material.setEmissiveTexture(null)
    material.setMetallicFactor(0)
    material.setRoughnessFactor(1)
  }
}

function report(doc) {
  const root = doc.getRoot()
  const textures = root.listTextures().map((texture) => {
    const size = texture.getSize() ?? [0, 0]
    return `${texture.getName() || texture.getURI()} ${size[0]}x${size[1]}`
  })
  console.log(
    JSON.stringify({
      target: TARGET.pathname,
      meshes: root.listMeshes().length,
      materials: root.listMaterials().map((material) => material.getName()),
      textures,
      animations: root.listAnimations().map((animation) => animation.getName()),
    }),
  )
}
