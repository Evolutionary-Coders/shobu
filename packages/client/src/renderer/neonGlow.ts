import type { Camera } from '@babylonjs/core/Cameras/camera'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'

/**
 * O halo dos letreiros de neon (ADR 0013): na hora azul o neon é luz, e luz
 * sem halo lê como placa pintada.
 *
 * Todas as malhas entram no passe do halo, mas **só o neon emite**: o resto
 * entra preto. O glow do babylon pega toda emissiva, e no cenário cozido a
 * emissiva é o albedo de todo prédio — sem o seletor, o bairro inteiro
 * brilharia. E entrar preto não é desperdício: é a parede que **tapa** o halo.
 * Com só o neon no passe (`addIncludedOnlyMesh`, como foi primeiro), nada
 * ficava na frente dele, e o brilho dos letreiros atravessava as paredes
 * (validação da `dev`, 10/10).
 *
 * Preso à câmera do mundo: o viewmodel desenha por uma câmera própria
 * (`viewmodelCamera.ts`), e a arma brilhando na mão seria o neon da rua
 * vazando para o hud.
 *
 * A textura do halo é um quarto da tela: o halo é borrado de qualquer jeito,
 * e no celular de meio de gama cada passe em resolução cheia custa quadro.
 *
 * ```ts
 * glowNeon(scene, camera, await loadArenaScenery(scene, blockout, greybox, report))
 * ```
 */
export function glowNeon(scene: Scene, camera: Camera, neons: readonly AbstractMesh[]): void {
  if (neons.length === 0) return
  const glow = new GlowLayer('neon', scene, { camera, mainTextureRatio: 0.25, blurKernelSize: 48 })
  glow.intensity = 0.9
  const glowing = new Set<AbstractMesh>(neons)
  glow.customEmissiveColorSelector = (mesh, _subMesh, material, result) => {
    if (glowing.has(mesh) && material instanceof StandardMaterial) {
      const { r, g, b } = material.emissiveColor
      result.set(r, g, b, 1)
      return
    }
    result.set(0, 0, 0, 1)
  }
}
