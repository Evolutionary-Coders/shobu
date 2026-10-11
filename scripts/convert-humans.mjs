#!/usr/bin/env node
import { mkdirSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, quantize } from '@gltf-transform/functions'

/**
 * Leva os humanos do blender para o jogo, e separa os clipes num arquivo só:
 *
 *   blender -b -P scripts/blender/build_humans.py && node scripts/convert-humans.mjs
 *
 * **Os clipes ficam num arquivo, os humanos em outro.** Os quatro humanos
 * tocam os mesmos 22 clipes, e os clipes são quase todo o peso do
 * `competitor.glb` (~900 kB). Embarcar os clipes em cada humano seria baixar
 * isso quatro vezes; aqui sai `competitor-clips.glb` uma vez, e o cliente
 * reaponta os clipes para o esqueleto de cada humano pelo nome do osso
 * (`loadCompetitorAvatar.ts`).
 *
 * **Os clipes perdem a translação de todo osso que não é a pelve.** Medido no
 * `competitor.glb`: nenhum outro osso anima translação nem escala — o canal
 * só repete o comprimento do osso do Mannequin. Num humano de ombro mais
 * estreito, repetir esse comprimento alargaria o ombro dele até o do
 * Mannequin. Sem o canal, cada osso fica com o próprio comprimento, e o giro
 * vem do clipe — `build_humans.py` já pôs os ângulos de repouso dos humanos
 * iguais aos do Mannequin.
 *
 * Cada humano entra quantizado (KHR_mesh_quantization), sem cor de vértice.
 */
const ROOT = new URL('..', import.meta.url)
const WORK = new URL('assets/work/humanos/', ROOT)
const CHARACTER = new URL('packages/client/public/assets/character/', ROOT)
const CLIPS_SOURCE = new URL('competitor.glb', CHARACTER)
const CLIPS_TARGET = new URL('competitor-clips.glb', CHARACTER)
const HUMANS_TARGET = new URL('humans/', CHARACTER)

/** Os ids de `scripts/blender/humanos_elenco.py`, na ordem do catálogo de skins. */
const HUMAN_IDS = ['brick', 'ronin', 'vex', 'nova']

/** O único osso cujo clipe move de lugar: é o que sobe, desce e agacha o corpo. */
const TRANSLATED_JOINT = 'pelvis'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

mkdirSync(HUMANS_TARGET, { recursive: true })
const clipJoints = await writeClips()
for (const id of HUMAN_IDS) await writeHuman(id, clipJoints)

/** O `competitor.glb` sem malha, sem material e só com giro (e a pelve andando). */
async function writeClips() {
  const doc = await io.read(CLIPS_SOURCE.pathname)
  const root = doc.getRoot()
  // os nomes saem antes do prune: sem malha, o skin não tem mais quem o use
  // e o prune o descarta — os nós dos ossos ficam, a lista deles não.
  const joints = jointNamesOf(root)
  dropMeshes(root)
  const dropped = root
    .listAnimations()
    .flatMap((animation) => animation.listChannels())
    .reduce((count, channel) => count + dropIfLengthChannel(channel), 0)
  await doc.transform(prune({ keepLeaves: true }), dedup())
  await io.write(CLIPS_TARGET.pathname, doc)
  console.log(
    JSON.stringify({
      event: 'competitor-clips',
      clips: root.listAnimations().length,
      droppedChannels: dropped,
      meshes: root.listMeshes().length,
    }),
  )
  return joints
}

function jointNamesOf(root) {
  return (root.listSkins()[0]?.listJoints() ?? []).map((joint) => joint.getName())
}

function dropMeshes(root) {
  for (const node of root.listNodes()) {
    if (node.getMesh()) node.dispose()
  }
  for (const mesh of root.listMeshes()) mesh.dispose()
}

function dropIfLengthChannel(channel) {
  const path = channel.getTargetPath()
  if (path === 'rotation') return 0
  if (path === 'translation' && channel.getTargetNode()?.getName() === TRANSLATED_JOINT) return 0
  // o sampler vai junto: canal descartado sem ele deixa o accessor vivo no
  // prune, o mesmo vazamento registrado em convert-competitor.mjs.
  const sampler = channel.getSampler()
  channel.dispose()
  if (sampler) sampler.dispose()
  return 1
}

async function writeHuman(id, clipJoints) {
  const doc = await io.read(new URL(`${id}.glb`, WORK).pathname)
  const root = doc.getRoot()
  assertSameJoints(id, root, clipJoints)
  stripVertexColors(root)
  await doc.transform(
    prune(),
    dedup(),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
  )
  const target = new URL(`${id}.glb`, HUMANS_TARGET)
  await io.write(target.pathname, doc)
  console.log(JSON.stringify({ event: 'human', id, ...measure(root) }))
}

/** Sem os mesmos nomes de osso, o clipe reapontado no cliente não acha onde tocar. */
function assertSameJoints(id, root, clipJoints) {
  const joints = jointNamesOf(root)
  const missing = clipJoints.filter((name) => !joints.includes(name))
  if (missing.length > 0) {
    throw new Error(`${id}.glb não tem os ossos [${missing.join(', ')}]; esperado os 65 da UAL`)
  }
}

/** O babylon multiplica a difusa pela cor de vértice; o atlas já tem tudo. */
function stripVertexColors(root) {
  const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives())
  for (const primitive of primitives) {
    const colors = primitive.listSemantics().filter((semantic) => semantic.startsWith('COLOR_'))
    for (const semantic of colors) primitive.setAttribute(semantic, null)
  }
}

function measure(root) {
  let triangles = 0
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      triangles += (primitive.getIndices()?.getCount() ?? 0) / 3
    }
  }
  return {
    triangles,
    materials: root.listMaterials().map((material) => material.getName()),
    textures: root.listTextures().map((texture) => `${texture.getMimeType()} ${texture.getSize()}`),
  }
}
