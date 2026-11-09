/**
 * A câmera que pode receber um halo. Estrutural: o teste roda em node, e a
 * câmera do babylon cabe aqui como está — `rigParent` é a câmera de quem um
 * olho do óculos (`cardboardView.ts`) é filho.
 */
export interface GlowViewpoint {
  readonly rigParent?: unknown
}

/**
 * Verdadeiro quando o halo preso a `layerCamera` deve ser misturado na tela
 * depois de `renderingCamera` desenhar. Sem câmera presa, qualquer uma serve.
 *
 * Existe porque o babylon só escolhe a câmera no passe que **gera** o halo
 * (`_renderMainTexture`); o passe que o **mistura** (`_draw`, no
 * `effectLayerSceneComponent`) desenha toda camada ligada depois de toda
 * câmera. Com duas camadas — a da cidade e a da mão, desde ba4a3dd — o neon
 * da rua era pintado duas vezes, a segunda por cima da arma e do hud.
 *
 * ```ts
 * glowDrawsFor(worldCamera, viewmodelCamera) // false: o neon da rua não vaza para a arma
 * glowDrawsFor(worldCamera, leftEye) // true quando leftEye.rigParent === worldCamera
 * ```
 */
export function glowDrawsFor(
  layerCamera: GlowViewpoint | null,
  renderingCamera: GlowViewpoint | null,
): boolean {
  if (!layerCamera) return true
  if (renderingCamera === layerCamera) return true
  return renderingCamera?.rigParent === layerCamera
}
