import type { Camera } from '@babylonjs/core/Cameras/camera'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import { glowDrawsFor } from './glowCamera.ts'
import { VIEWMODEL_LAYER } from './viewmodelCamera.ts'
import {
  glowsInViewmodel,
  VIEWMODEL_GLOW,
  VIEWMODEL_GLOW_LAYER,
  viewmodelGlowColor,
} from './viewmodelGlow.ts'

/**
 * O halo dos letreiros de neon (ADR 0013): na hora azul o neon é luz, e luz
 * sem halo lê como placa pintada.
 *
 No passe do halo entram o neon e, como **parede**, o greybox: a arena em
 * caixas, que só escreve profundidade. Com só o neon no passe, nada ficava na
 * frente dele, e o brilho dos letreiros atravessava as paredes (validação da
 * `dev`, 10/10); com a cidade inteira no passe, ela era desenhada duas vezes,
 * e o glow custava ~5 ms de cpu por quadro (medição de 11/10). O greybox tapa
 * o que a arena tapa, em poucos milhares de triângulos.
 *
 * No passe principal o greybox não desenha nada: o material dele não escreve
 * cor nem profundidade, e a profundidade só liga durante o passe do halo.
 *
 * Preso à câmera do mundo: o viewmodel desenha por uma câmera própria
 * (`viewmodelCamera.ts`), e a arma brilhando na mão seria o neon da rua
 * vazando para o hud. A opção `camera` do babylon só prende a **geração** do
 * halo; a mistura na tela ignora a câmera e roda depois de todas — desde
 * ba4a3dd, com o halo da mão, o da rua saía dobrado e por cima da arma. Quem
 * prende a mistura é `CameraBoundGlowLayer` (`glowCamera.ts`).
 *
 * **No celular não há halo.** As paredes no passe custam um segundo desenho
 * de cada vértice da cidade (~359 mil triângulos), e o chrome do android de
 * meio de gama é onde esse custo vira quadro perdido (revisão do PR #21). A
 * predefinição de qualidade é quem vai decidir isso por medição; até lá, o
 * ponteiro grosso desliga.
 *
 * A textura do halo é um quarto da tela: o halo é borrado de qualquer jeito,
 * e no celular de meio de gama cada passe em resolução cheia custa quadro.
 *
 * ```ts
 * glowNeon(scene, camera, await loadArenaScenery(scene, blockout, greybox, report), greybox)
 * ```
 */
export function glowNeon(
  scene: Scene,
  camera: Camera,
  neons: readonly AbstractMesh[],
  walls: readonly Mesh[],
): boolean {
  if (neons.length === 0 || isPhone()) return false
  const glow = new CameraBoundGlowLayer('neon', scene, {
    camera,
    mainTextureRatio: 0.25,
    blurKernelSize: 48,
    excludeByDefault: true,
  })
  glow.intensity = 0.9
  for (const mesh of neons) if (mesh instanceof Mesh) glow.addIncludedOnlyMesh(mesh)
  occludeWith(glow, walls, scene)
  const glowing = new Set<AbstractMesh>(neons)
  glow.customEmissiveColorSelector = (mesh, _subMesh, material, result) => {
    if (glowing.has(mesh) && material instanceof StandardMaterial) {
      const { r, g, b } = material.emissiveColor
      result.set(r, g, b, 1)
      return
    }
    result.set(0, 0, 0, 1)
  }
  return true
}

/**
 * O `GlowLayer` que só é misturado na tela depois da própria câmera. Durante
 * a mistura, `scene.activeCamera` é a câmera que acabou de desenhar; na
 * geração, o babylon já filtra pela câmera, e o filtro aqui só repete o dele.
 * A cena vem no construtor porque a dela, no babylon, é interna.
 */
class CameraBoundGlowLayer extends GlowLayer {
  constructor(
    name: string,
    private readonly boundScene: Scene,
    options: ConstructorParameters<typeof GlowLayer>[2],
  ) {
    super(name, boundScene, options)
  }

  override shouldRender(): boolean {
    return super.shouldRender() && glowDrawsFor(this.camera, this.boundScene.activeCamera)
  }
}

/** O greybox como parede do halo: invisível no passe principal, profundidade no do glow. */
function occludeWith(glow: GlowLayer, walls: readonly Mesh[], scene: Scene): void {
  const material = new StandardMaterial('glow-parede', scene)
  material.disableColorWrite = true
  material.disableDepthWrite = true
  const occluding = new Set<AbstractMesh>(walls)
  const replaced = new Set(walls.map((wall) => wall.material))
  for (const wall of walls) {
    wall.material = material
    glow.addIncludedOnlyMesh(wall)
  }
  // os materiais de camada do greybox só serviam às caixas: saem da gpu.
  for (const old of replaced) old?.dispose(false, true)
  glow.onBeforeRenderMeshToEffect.add((mesh) => {
    if (occluding.has(mesh)) material.disableDepthWrite = false
  })
  glow.onAfterRenderMeshToEffect.add((mesh) => {
    if (occluding.has(mesh)) material.disableDepthWrite = true
  })
}

/** O halo da mão; quem pendura malha nova no viewmodel chama `refresh`. */
export interface ViewmodelGlow {
  refresh(): void
}

/**
 * O halo do neon da mão, preso à câmera do viewmodel (`viewmodelGlow.ts`):
 * em toda predefinição e também no celular, porque o passe só desenha as
 * peças que acendem — umas dezenas de triângulos perto do olho, e não a
 * cidade. Sem peça nenhuma ainda, o babylon nem roda o passe.
 *
 * `refresh` varre a cena atrás das malhas do viewmodel que acendem: a sniper
 * e as lâminas chegam depois do boot, e a máscara delas é trocada só depois
 * de entrarem na cena — é o mesmo momento em que a lista de candidatas da
 * câmera é invalidada.
 *
 * ```ts
 * const glow = glowViewmodelNeon(scene, viewmodelCamera)
 * glow.refresh() // a laser acabou de chegar
 * ```
 */
export function glowViewmodelNeon(scene: Scene, camera: Camera): ViewmodelGlow {
  const glow = new CameraBoundGlowLayer(VIEWMODEL_GLOW_LAYER, scene, {
    camera,
    mainTextureRatio: VIEWMODEL_GLOW.mainTextureRatio,
    blurKernelSize: VIEWMODEL_GLOW.blurKernelSize,
    excludeByDefault: true,
  })
  glow.intensity = VIEWMODEL_GLOW.intensity
  glow.customEmissiveColorSelector = (_mesh, _subMesh, material, result) => {
    if (material instanceof StandardMaterial) viewmodelGlowColor(material, result)
    else result.set(0, 0, 0, 1)
  }
  return {
    refresh: () => {
      for (const mesh of scene.meshes) if (glowsInHand(mesh)) glow.addIncludedOnlyMesh(mesh)
    },
  }
}

function glowsInHand(mesh: AbstractMesh): mesh is Mesh {
  if (!(mesh instanceof Mesh) || (mesh.layerMask & VIEWMODEL_LAYER) === 0) return false
  return glowsInViewmodel(mesh.name, mesh.material?.name ?? '')
}

function isPhone(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}
