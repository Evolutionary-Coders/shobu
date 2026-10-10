import type { Camera } from '@babylonjs/core/Cameras/camera'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'

/**
 * O halo dos letreiros de neon (ADR 0013): na hora azul o neon é luz, e luz
 * sem halo lê como placa pintada.
 *
 * **Só** as malhas de neon entram (`excludeByDefault`): o glow do babylon pega
 * toda emissiva, e no cenário cozido a emissiva é o albedo de todo prédio —
 * sem a lista, o bairro inteiro brilharia.
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
  const glow = new GlowLayer('neon', scene, {
    camera,
    mainTextureRatio: 0.25,
    blurKernelSize: 48,
    excludeByDefault: true,
  })
  glow.intensity = 0.9
  for (const mesh of neons) {
    if (mesh instanceof Mesh) glow.addIncludedOnlyMesh(mesh)
  }
}
