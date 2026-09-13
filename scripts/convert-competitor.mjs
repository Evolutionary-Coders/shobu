#!/usr/bin/env node
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, mergeDocuments, prune, resample } from '@gltf-transform/functions'

/**
 * Monta o personagem competidor a partir das duas Universal Animation Library
 * da Quaternius (CC0), em `assets/source/animation/`:
 *
 *   node scripts/convert-competitor.mjs
 *
 * **Por que as duas juntas.** As bibliotecas têm o *mesmo* esqueleto — os
 * mesmos 65 joints, na mesma ordem — então mesclar é remapear canal por nome,
 * não retargetar. A UAL1 traz locomoção, pulo, morte e a pose de arma; a UAL2
 * traz slide, o pulo duplo e a reação de dano. Nenhuma das duas serve no SWAT
 * da Quaternius que o jogo usava antes, cujo rig é outro (62 joints, com
 * `Shoulder.L` no lugar de `clavicle_l`): era retarget no blender, e trocar o
 * personagem pelo Mannequin da própria UAL dispensa o retarget inteiro.
 *
 * O Mannequin já passa nos portões da ADR 0004 de graça: 1,829 m (métrico),
 * sem textura, duas cores chapadas, sem pbr. E o laranja resolve o defeito
 * registrado em `docs/asset-licenses.md` de o SWAT preto sumir contra o chão
 * escuro depois de 20 m.
 */
const UAL1 = new URL(
  '../assets/source/animation/universal-animation-library-standard/Unreal-Godot/UAL1_Standard.glb',
  import.meta.url,
)
const UAL2 = new URL(
  '../assets/source/animation/universal-animation-library-2/Unreal-Godot/UAL2_Standard.glb',
  import.meta.url,
)
const TARGET = new URL('../packages/client/public/assets/character/competitor.glb', import.meta.url)

/** Locomoção, pulo, morte, dano e a pose de arma. */
const CLIPS_FROM_UAL1 = [
  'Idle_Loop',
  'Pistol_Idle_Loop',
  'Walk_Loop',
  'Jog_Fwd_Loop',
  'Sprint_Loop',
  'Crouch_Idle_Loop',
  'Crouch_Fwd_Loop',
  'Jump_Start',
  'Jump_Loop',
  'Jump_Land',
  'Pistol_Shoot',
  'Pistol_Reload',
  'Death01',
  'Hit_Chest',
  'Sword_Attack',
]

/** Slide, pulo duplo e o empurrão do dano — tudo que a UAL1 não tinha. */
const CLIPS_FROM_UAL2 = [
  'Slide_Start',
  'Slide_Loop',
  'Slide_Exit',
  'NinjaJump_Start',
  'NinjaJump_Idle_Loop',
  'NinjaJump_Land',
  'Hit_Knockback',
]

/**
 * Dedo não se vê a 20 m, e os cinco dedos de cada mão são 30 dos 65 joints —
 * quase metade de todo canal de animação do arquivo.
 */
const FINGER_JOINT = /^(index|middle|pinky|ring|thumb)_/

/**
 * A UAL é assada a 30 quadros por segundo com chave em todo quadro. Esta
 * tolerância derruba a chave que a interpolação linear já reproduz, e é o que
 * leva o resultado de 3,7 MB para menos de 1 MB.
 */
const RESAMPLE_TOLERANCE = 1e-3

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const ual2 = await io.read(UAL2.pathname)
const ual1 = await io.read(UAL1.pathname)

keepOnly(ual2, CLIPS_FROM_UAL2)
const jointsByName = new Map(
  ual2
    .getRoot()
    .listSkins()[0]
    .listJoints()
    .map((joint) => [joint.getName(), joint]),
)

const beforeMerge = ual2.getRoot().listAnimations().length
mergeDocuments(ual2, ual1)
retargetMergedClips(ual2, beforeMerge, jointsByName)
dropMergedDuplicates(ual2)
dropFingerChannels(ual2)

await ual2.transform(prune(), dedup(), resample({ tolerance: RESAMPLE_TOLERANCE }))
unifyBuffers(ual2)
await io.write(TARGET.pathname, ual2)
report(ual2)

/**
 * Descarta um clipe **e os samplers dele**.
 *
 * `animation.dispose()` sozinho não descarta os samplers, e os accessors dos
 * clipes jogados fora sobrevivem ao `prune()`: medido, a diferença é de 955 kB
 * para 10,6 MB. Se este arquivo crescer de repente, é aqui.
 */
function disposeAnimation(animation) {
  for (const channel of animation.listChannels()) {
    const sampler = channel.getSampler()
    channel.dispose()
    if (sampler) sampler.dispose()
  }
  for (const sampler of animation.listSamplers()) sampler.dispose()
  animation.dispose()
}

function keepOnly(doc, wanted) {
  for (const animation of doc.getRoot().listAnimations()) {
    if (!wanted.includes(animation.getName())) disposeAnimation(animation)
  }
}

/**
 * Aponta cada canal dos clipes vindos da UAL1 para o joint de mesmo nome do
 * esqueleto que fica. É a mescla inteira: os dois esqueletos são idênticos, e
 * o que a mesclagem cria de sobra é descartado logo em seguida.
 */
function retargetMergedClips(doc, firstMergedIndex, jointsByName) {
  for (const animation of doc.getRoot().listAnimations().slice(firstMergedIndex)) {
    if (!CLIPS_FROM_UAL1.includes(animation.getName())) {
      disposeAnimation(animation)
      continue
    }
    for (const channel of animation.listChannels()) {
      const name = channel.getTargetNode()?.getName()
      const joint = jointsByName.get(name)
      if (!joint)
        throw new Error(`o canal aponta para '${name}', que não existe no esqueleto que fica`)
      channel.setTargetNode(joint)
    }
  }
}

/**
 * A mesclagem traz cena, esqueleto, nós e malha da UAL1; fica só o conjunto da
 * UAL2, com os clipes já reapontados para o esqueleto dela.
 *
 * Descartar a cena **não** descarta os nós dela: eles ficam órfãos, ainda
 * apontando para a malha duplicada, e é por isso que a varredura é por
 * alcançabilidade a partir da cena que fica, e não por `getMesh()`.
 */
function dropMergedDuplicates(doc) {
  const root = doc.getRoot()
  const scenes = root.listScenes()
  root.setDefaultScene(scenes[0])
  for (const scene of scenes.slice(1)) scene.dispose()
  for (const skin of root.listSkins().slice(1)) skin.dispose()
  const reachable = reachableNodes(scenes[0])
  for (const node of root.listNodes()) {
    if (!reachable.has(node)) node.dispose()
  }
  dropUnreachableMeshes(root, reachable)
}

/** Varredura em largura a partir da cena que fica. Ver o docblock acima. */
function reachableNodes(scene) {
  const reachable = new Set()
  const queue = [...scene.listChildren()]
  while (queue.length > 0) {
    const node = queue.pop()
    if (reachable.has(node)) continue
    reachable.add(node)
    queue.push(...node.listChildren())
  }
  return reachable
}

function dropUnreachableMeshes(root, reachable) {
  const kept = new Set()
  for (const node of reachable) {
    const mesh = node.getMesh()
    if (mesh) kept.add(mesh)
  }
  for (const mesh of root.listMeshes()) {
    if (!kept.has(mesh)) mesh.dispose()
  }
}

function dropFingerChannels(doc) {
  for (const animation of doc.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) dropIfFingerChannel(channel)
  }
}

function dropIfFingerChannel(channel) {
  const name = channel.getTargetNode()?.getName() ?? ''
  if (!FINGER_JOINT.test(name)) return
  // descartar o canal não descarta o sampler dele, e os accessors sobrevivem
  // ao prune: sem esta linha o glb sai com 10,6 mb em vez de 955 kb.
  const sampler = channel.getSampler()
  channel.dispose()
  if (sampler) sampler.dispose()
}

/** Um glb aceita um buffer só, e a mesclagem deixa dois. */
function unifyBuffers(doc) {
  const root = doc.getRoot()
  const [kept, ...extra] = root.listBuffers()
  for (const buffer of extra) {
    for (const accessor of root.listAccessors()) {
      if (accessor.getBuffer() === buffer) accessor.setBuffer(kept)
    }
    buffer.dispose()
  }
}

function report(doc) {
  const root = doc.getRoot()
  const mesh = root.listMeshes()[0]
  const position = mesh?.listPrimitives()[0]?.getAttribute('POSITION')
  const height = position ? position.getMax([])[1] - position.getMin([])[1] : 0
  console.log(
    JSON.stringify({
      target: TARGET.pathname,
      meshes: root.listMeshes().length,
      materials: root.listMaterials().map((material) => material.getName()),
      skins: root.listSkins().length,
      joints: root.listSkins()[0]?.listJoints().length ?? 0,
      heightM: Number(height.toFixed(3)),
      animations: root.listAnimations().map((animation) => animation.getName()),
    }),
  )
}
