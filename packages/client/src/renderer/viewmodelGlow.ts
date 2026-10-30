import { isBladeGlow, keepsOwnGlow } from './selfLitParts.ts'

/**
 * O halo do neon na mão: o `laser_*` da HANABI, as placas cibernéticas dos
 * braços e o fio das lâminas, desenhados pela câmera do viewmodel. Decisão da
 * equipe (29/10, ADR 0030): **em toda predefinição**, DESEMPENHO incluída — é
 * a exceção ao halo da ADR 0014, que só desliga o da cidade. O custo é pequeno
 * de propósito: meia resolução, kernel curto, e só as peças que acendem entram
 * no passe; o resto da arma nem é desenhado nele.
 *
 * O feixe do tiro não entra: ele já tem o halo aditivo dele (`tracerBeams.ts`).
 */

/** O nome da camada: `applyQuality.ts` a reconhece e não a desliga. */
export const VIEWMODEL_GLOW_LAYER = 'viewmodel-neon'

/** Meia resolução e kernel curto: o halo é borrado de qualquer jeito, e a arma é pequena na tela. */
export const VIEWMODEL_GLOW = {
  mainTextureRatio: 0.5,
  blurKernelSize: 16,
  intensity: 0.8,
} as const

/**
 * Verdadeiro para a peça do viewmodel que acende e entra no halo. Material
 * sem emissão nenhuma fica fora: entrar seria um desenho a mais sem luz.
 *
 * ```ts
 * glowsInViewmodel('laser_emitter', 'viewmodel-sniper_laser_palette') // true
 * glowsInViewmodel('Object_80', 'viewmodel-arms') // false
 * ```
 */
export function glowsInViewmodel(meshName: string, materialName: string): boolean {
  return keepsOwnGlow(meshName) || isBladeGlow(materialName)
}

/** O que a cor do halo lê de um material. Estrutural: o teste roda em node. */
export interface GlowSource {
  readonly emissiveTexture: unknown
  readonly emissiveColor: { readonly r: number; readonly g: number; readonly b: number }
}

/** Onde a cor sai: o `Color4` do babylon, reescrito sem alocar. */
export interface GlowTarget {
  set(r: number, g: number, b: number, a: number): unknown
}

/**
 * A cor que multiplica a peça no passe do halo. Com textura emissiva, branco:
 * a cor está na textura, e a emissiva do material é **preta** de propósito
 * (`applyEmissiveTexture`) — multiplicar por ela apagaria o halo. Sem textura
 * (o fio da lâmina), a cor emissiva do acabamento.
 *
 * ```ts
 * viewmodelGlowColor(material, result) // result = (1, 1, 1, 1) no neon da laser
 * ```
 */
export function viewmodelGlowColor(source: GlowSource, out: GlowTarget): void {
  if (source.emissiveTexture) {
    out.set(1, 1, 1, 1)
    return
  }
  const { r, g, b } = source.emissiveColor
  out.set(r, g, b, 1)
}

/**
 * A predefinição liga e desliga o halo da cidade (`neonGlow`), e nunca o da mão.
 *
 * ```ts
 * effectLayerEnabled(VIEWMODEL_GLOW_LAYER, false) // true: DESEMPENHO também
 * ```
 */
export function effectLayerEnabled(layerName: string, neonGlow: boolean): boolean {
  return layerName === VIEWMODEL_GLOW_LAYER || neonGlow
}
