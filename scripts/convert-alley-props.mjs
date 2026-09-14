#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, prune, weld } from '@gltf-transform/functions'

/**
 * Tira dois condensadores de ar-condicionado do beco cyberpunk e monta com eles
 * o kit de prop da arena, em `assets/maps/`:
 *
 *   node scripts/convert-alley-props.mjs
 *
 * **Por que só dois, de 1.815 malhas.** O beco é kitbash: medido, 47% das
 * formas dele são repetição da mesma peça, e o que resta são 767 formas únicas
 * com nome de blender (`Cube.8875`), sem semântica nenhuma. Renderizadas uma a
 * uma, as duas que valem são estas — **caixas**, e caixa é a única forma cuja
 * silhueta uma `StaticBox` do núcleo reproduz sem mentir. Um cano ou uma escada
 * precisariam de caixa maior que eles, e o jogador descobriria isso com a bala
 * parando no ar.
 *
 * As duas dividem o mesmo material, então o kit inteiro carrega **uma** textura.
 *
 * `docs/asset-licenses.md` registra este arquivo como "não entra, serve de
 * referência" — e aquilo valia para ele como **mapa**, com 1.815 draw calls.
 * Como banco de peça, peça a peça, é exatamente o uso que a mesma tabela
 * prevê para cenário inteiro.
 */
const SOURCE = new URL('../assets/maps/beco-cyberpunk/source/Untitled.glb', import.meta.url)
const TARGET = new URL('../packages/client/public/assets/props/alley-kit.glb', import.meta.url)

/**
 * Nome no blender → nome no kit. É a única ponte entre o arquivo de origem e
 * `arenaProps.ts`, e por isso o nome do kit é semântico: quem ler
 * `condenser-wide` na cena não precisa voltar aqui para saber o que é.
 */
const KIT = {
  'Cube.772__0': 'condenser-wide',
  'Cube.768__0': 'condenser-narrow',
}

/**
 * A mesma faixa das texturas do greybox (ADR 0004: 128 a 256 px). A origem é
 * uma trimsheet de 2048² com `metallicRoughness`, `normal` e emissivo — três
 * mapas que a ADR proíbe e que aqui viram nada.
 */
const TEXTURE_SIZE_PX = 256

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(SOURCE.pathname)

// `flatten` **antes** de escolher: ele assa a hierarquia de quatro níveis do
// beco em nós filhos da cena, e é o que permite arrancar dois nós sem levar
// junto a matriz de um pai que fica para trás.
await doc.transform(flatten())
keepOnlyKitNodes(doc)
await doc.transform(weld(), prune(), dedup())
stripForbiddenMaps(doc)
dropUnusedTextures(doc)
shrinkBaseColor(doc)
await doc.transform(prune(), dedup())
await io.write(TARGET.pathname, doc)
report(doc)

/**
 * Descarta todo nó que não é do kit. É varredura por alcançabilidade a partir
 * da cena, e não `node.dispose()` solto, pelo mesmo motivo que
 * `convert-competitor.mjs` registra: nó descartado deixa malha órfã que
 * sobrevive ao `prune`.
 */
function keepOnlyKitNodes(doc) {
  const scene = doc.getRoot().getDefaultScene()
  const kept = []
  for (const node of doc.getRoot().listNodes()) {
    const name = KIT[node.getName()]
    if (!name) continue
    node.setName(name)
    node.getMesh()?.setName(name)
    kept.push(node)
  }
  const missing = Object.values(KIT).filter((name) => !kept.some((n) => n.getName() === name))
  if (missing.length > 0) {
    throw new Error(
      `o glb de origem não tem ${missing.join(', ')}; esperado os ${Object.keys(KIT).length} nós do kit`,
    )
  }
  for (const child of scene.listChildren()) {
    if (!kept.includes(child)) scene.removeChild(child)
  }
  for (const node of kept) centerOnOrigin(node)
}

/**
 * Põe o centro da caixa envolvente do prop na origem do nó. Sem isto o prop
 * nasce com a posição que tinha no beco — a 3,8 m do centro daquele mapa — e
 * `arenaProps.ts` teria que compensar um deslocamento que não significa nada.
 *
 * Centro, e não base: é o centro que `boxFromCenterSize` do núcleo pede, e prop
 * e caixa de colisão saindo do **mesmo** ponto é o que impede a bala de parar
 * onde não há nada.
 */
function centerOnOrigin(node) {
  const position = node.getMesh().listPrimitives()[0].getAttribute('POSITION')
  const min = position.getMin([])
  const max = position.getMax([])
  node.setTranslation(min.map((low, axis) => -(low + max[axis]) / 2))
}

/**
 * `metallicRoughness`, `normal`, oclusão e emissivo saem por decisão de arte
 * com efeito direto no orçamento de quadro (ADR 0004), e não por peso — são
 * quatro texturas de 2048² que juntas pesam mais que o resto do jogo.
 */
function stripForbiddenMaps(doc) {
  for (const material of doc.getRoot().listMaterials()) {
    material
      .setMetallicRoughnessTexture(null)
      .setNormalTexture(null)
      .setOcclusionTexture(null)
      .setEmissiveTexture(null)
      .setEmissiveFactor([0, 0, 0])
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
    for (const extension of material.listExtensions()) extension.dispose()
  }
}

/**
 * O `prune` não leva a textura da extensão `KHR_materials_transmission` junto
 * com a extensão que a referenciava, e ela ficava no kit sem ninguém usar.
 */
function dropUnusedTextures(doc) {
  const used = new Set(
    doc
      .getRoot()
      .listMaterials()
      .map((material) => material.getBaseColorTexture())
      .filter((texture) => texture !== null),
  )
  for (const texture of doc.getRoot().listTextures()) {
    if (!used.has(texture)) texture.dispose()
  }
}

/**
 * Reduz a textura de base para 256², com `magick` — a mesma ferramenta do
 * `convert-medals.mjs` e do `convert-arena-textures.mjs`. O gltf-transform tem
 * `textureCompress`, mas ele exige sharp, que o `convert-viewmodel.mjs` já
 * registra por que não entra aqui.
 */
function shrinkBaseColor(doc) {
  const work = mkdtempSync(join(tmpdir(), 'shobu-props-'))
  for (const texture of doc.getRoot().listTextures()) {
    const extension = texture.getMimeType().split('/')[1]
    const source = join(work, `in.${extension}`)
    const target = join(work, 'out.webp')
    writeFileSync(source, texture.getImage())
    execFileSync('magick', [
      source,
      '-strip',
      '-resize',
      `${TEXTURE_SIZE_PX}x${TEXTURE_SIZE_PX}!`,
      '-quality',
      '82',
      target,
    ])
    texture.setImage(readFileSync(target)).setMimeType('image/webp')
  }
}

function report(doc) {
  const root = doc.getRoot()
  const props = root.listNodes().map((node) => ({
    name: node.getName(),
    sizeM: sizeOf(node).map((value) => Number(value.toFixed(3))),
    triangles: triangleCountOf(node),
  }))
  console.log(
    JSON.stringify({
      target: TARGET.pathname,
      props,
      materials: root.listMaterials().map((material) => material.getName()),
      textures: root.listTextures().map((texture) => texture.getSize().join('x')),
      bytes: readFileSync(TARGET.pathname).byteLength,
    }),
  )
}

/**
 * O tamanho é o que `arenaProps.ts` copia para a caixa de colisão: prop e caixa
 * têm que sair do mesmo número, senão o que se vê deixa de ser o que para a bala.
 */
function sizeOf(node) {
  const position = node.getMesh().listPrimitives()[0].getAttribute('POSITION')
  const scale = node.getScale()
  return position.getMax([]).map((max, axis) => (max - position.getMin([])[axis]) * scale[axis])
}

function triangleCountOf(node) {
  return node
    .getMesh()
    .listPrimitives()
    .reduce((total, primitive) => total + primitive.getIndices().getCount() / 3, 0)
}
