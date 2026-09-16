import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import {
  type DeadChannelSkySpec,
  grainFrameAt,
  paintDeadChannel,
  rollOffsetAt,
} from '../arena/deadChannelSky.ts'

/**
 * O céu fica sozinho no grupo 0 e **todo o resto vai para o 1**. O babylon
 * limpa o depth entre grupos, e é isso que torna o raio da cúpula irrelevante:
 * ela não consegue esconder nada, nem a torre mais distante do anel.
 *
 * A alternativa — cúpula maior que a geometria mais longe — amarraria o raio do
 * céu ao tamanho do anel de fundo, e quem mexesse num descobriria no outro.
 */
const SKY_GROUP = 0
const SCENE_GROUP = 1

/**
 * Qualquer valor entre `minZ` e `maxZ` serve, porque `infiniteDistance` centra
 * a cúpula na câmera e o depth é limpo depois dela. 800 m é folgado dos dois
 * lados e não significa nada além disso.
 */
const SKY_DIAMETER_M = 800

/**
 * Poucos segmentos de propósito: com filtro nearest sobre uma textura de
 * 64 × 128, esfera lisa não ganharia nada e faceta grande é vocabulário da
 * ADR 0004.
 */
const SKY_SEGMENTS = 24

/**
 * Traduz `deadChannelSky.ts` para o babylon: uma cúpula com a estática de
 * televisão fora do ar, repintada na frequência que o dado manda.
 *
 * Substitui o `clearColor` de cor única, que era o corte mais duro da imagem —
 * acima da linha dos prédios havia um vazio chapado, e nenhuma textura de
 * parede conserta isso.
 *
 * Sem teste unitário: os testes rodam em node, sem webgl (ADR 0001). Toda a
 * aritmética de pixel é testada em `deadChannelSky.test.ts`.
 *
 * ```ts
 * coverWithDeadChannelSky(scene, deadChannelSkySpec(), Math.random)
 * ```
 */
export function coverWithDeadChannelSky(
  scene: Scene,
  spec: DeadChannelSkySpec,
  random: () => number,
): void {
  const texture = createSkyTexture(scene, spec, random)
  const dome = createSkyDome(scene, texture)
  for (const mesh of scene.meshes) {
    mesh.renderingGroupId = mesh === dome ? SKY_GROUP : SCENE_GROUP
  }
  // a cúpula nasceu antes deste observador, então ela não cai na regra: quem
  // chegar depois — greybox, props, skyline, avatar, tracer — cai.
  scene.onNewMeshAddedObservable.add((mesh) => {
    mesh.renderingGroupId = SCENE_GROUP
  })
  rollDeadChannel(scene, spec, texture, random)
}

function createSkyTexture(
  scene: Scene,
  spec: DeadChannelSkySpec,
  random: () => number,
): RawTexture {
  const [width, height] = spec.sizePx
  const texture = RawTexture.CreateRGBATexture(
    paintDeadChannel(spec, random, 0),
    width,
    height,
    scene,
    // sem mipmap: a cúpula nunca é vista de longe — ela *é* o longe —, e mipmap
    // de chuvisco é chuvisco borrado, que é chuvisco nenhum.
    false,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  )
  texture.name = 'dead-channel-sky'
  return texture
}

/**
 * `disableLighting` e emissiva: o céu não obedece à chave nem ao
 * preenchimento da arena — ele é a fonte, não o que recebe. `fogEnabled`
 * desligado pelo mesmo motivo: a névoa desbota para a cor do horizonte, e
 * desbotar o horizonte para ele mesmo é trabalho a troco de nada.
 */
function createSkyDome(scene: Scene, texture: RawTexture): Mesh {
  const dome = CreateSphere(
    'dead-channel-sky',
    { diameter: SKY_DIAMETER_M, segments: SKY_SEGMENTS, sideOrientation: Mesh.BACKSIDE },
    scene,
  )
  const material = new StandardMaterial('dead-channel-sky', scene)
  material.emissiveTexture = texture
  material.diffuseColor = Color3.Black()
  material.specularColor = Color3.Black()
  material.disableLighting = true
  material.fogEnabled = false
  material.freeze()
  dome.material = material
  // a cúpula anda com a câmera: céu que fica para trás quando o jogador
  // atravessa a arena é céu que tem borda.
  dome.infiniteDistance = true
  dome.isPickable = false
  return dome
}

/**
 * Repinta quando o quadro de chuvisco muda, e **não a cada quadro**: a 144 Hz
 * seriam catorze repinturas por quadro de televisão, e a estática deixaria de
 * ler como tv para virar ruído de renderizador. A 10 Hz são 32 kB de upload
 * dez vezes por segundo, fora do caminho quente do tick.
 */
function rollDeadChannel(
  scene: Scene,
  spec: DeadChannelSkySpec,
  texture: RawTexture,
  random: () => number,
): void {
  let elapsedS = 0
  let paintedFrame = -1
  scene.onBeforeRenderObservable.add(() => {
    elapsedS += scene.getEngine().getDeltaTime() / 1000
    const frame = grainFrameAt(spec, elapsedS)
    if (frame === paintedFrame) return
    paintedFrame = frame
    texture.update(paintDeadChannel(spec, random, rollOffsetAt(spec, elapsedS)))
  })
}
