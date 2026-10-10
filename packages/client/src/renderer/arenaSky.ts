import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import { type DaySkySpec, paintDaySky } from '../arena/daySky.ts'

/**
 * O céu fica sozinho no grupo 0 e **todo o resto vai para o 1**. O babylon
 * limpa o depth entre grupos, e é isso que torna o raio da cúpula irrelevante:
 * ela não consegue esconder nada, nem a fachada mais distante do fundo.
 *
 * A alternativa — cúpula maior que a geometria mais longe — amarraria o raio do
 * céu ao tamanho do cenário de fundo, e quem mexesse num descobriria no outro.
 */
const SKY_GROUP = 0
const SCENE_GROUP = 1

/** O gradiente é liso e só vertical: segmentos a mais não mudariam nada na tela. */
const SKY_SEGMENTS = 32

/**
 * Traduz `daySky.ts` para o babylon: uma cúpula com o gradiente de um céu
 * limpo de dia (ADR 0010).
 *
 * Sem teste unitário: os testes rodam em node, sem webgl (ADR 0001). A
 * aritmética de pixel é testada em `daySky.test.ts`.
 *
 * `farPlaneM` é o `camera.maxZ` (o alcance do hitscan, em
 * `firstPersonViewer.ts`), e a cúpula tem **metade** dele de raio. Qualquer
 * raio entre `minZ` e `maxZ` serve, porque `infiniteDistance` centra a cúpula
 * na câmera e o depth é limpo depois dela — mas o raio era um 400 fixo, igual
 * ao `maxZ` de hoje e amarrado a nada: encurtar o alcance cortaria o céu
 * (revisão do PR #16). Derivado, os dois andam juntos.
 *
 * ```ts
 * coverWithDaySky(scene, daySkySpec(), config.weapon.hitscanRangeM)
 * ```
 */
export function coverWithDaySky(scene: Scene, spec: DaySkySpec, farPlaneM: number): void {
  const dome = createSkyDome(scene, createSkyTexture(scene, spec), farPlaneM)
  for (const mesh of scene.meshes) {
    mesh.renderingGroupId = mesh === dome ? SKY_GROUP : SCENE_GROUP
  }
  // a cúpula nasceu antes deste observador, então ela não cai na regra: quem
  // chegar depois — greybox, cenário, avatar, tracer — cai.
  scene.onNewMeshAddedObservable.add((mesh) => {
    mesh.renderingGroupId = SCENE_GROUP
  })
}

function createSkyTexture(scene: Scene, spec: DaySkySpec): RawTexture {
  const [width, height] = spec.sizePx
  const texture = RawTexture.CreateRGBATexture(
    paintDaySky(spec),
    width,
    height,
    scene,
    false,
    false,
    // bilinear, ao contrário do resto do jogo: 128 linhas de gradiente com
    // nearest viram faixas visíveis no céu, e faixa é defeito, não estilo.
    Texture.BILINEAR_SAMPLINGMODE,
  )
  texture.name = 'day-sky'
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  return texture
}

/**
 * `disableLighting` e emissiva: o céu é a fonte, não o que recebe luz.
 * `fogEnabled` desligado porque a névoa desbota para a cor do horizonte, e
 * desbotar o horizonte para ele mesmo é trabalho a troco de nada.
 */
function createSkyDome(scene: Scene, texture: RawTexture, farPlaneM: number): Mesh {
  const dome = CreateSphere(
    'day-sky',
    { diameter: farPlaneM, segments: SKY_SEGMENTS, sideOrientation: Mesh.BACKSIDE },
    scene,
  )
  const material = new StandardMaterial('day-sky', scene)
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
