import { isBladeGlow, keepsOwnGlow } from './selfLitParts.ts'

/**
 * O halo do neon na mão: o `laser_*` da HANABI, as placas cibernéticas dos
 * braços e o fio das lâminas, desenhados pela câmera do viewmodel. Decisão da
 * equipe (29/10, ADR 0030): **em toda predefinição**, DESEMPENHO incluída — é
 * a exceção ao halo da ADR 0014, que só desliga o da cidade. O custo é pequeno
 * de propósito: meia resolução, kernel curto, e só as peças que acendem entram
 * no passe — mais o corpo da sniper, de parede (`blocksViewmodelGlow`); o
 * resto da arma e os braços nem são desenhados nele.
 *
 * O feixe do tiro não entra: ele já tem o halo aditivo dele (`tracerBeams.ts`).
 */

/** O nome da camada: `applyQuality.ts` a reconhece e não a desliga. */
export const VIEWMODEL_GLOW_LAYER = 'viewmodel-neon'

/** Meia resolução e kernel curto: o halo é borrado de qualquer jeito, e a arma é pequena na tela. */
export const VIEWMODEL_GLOW = {
  mainTextureRatio: 0.5,
  blurKernelSize: 16,
  /** Um terço abaixo dos 0,8 de origem, junto com o da rua (playtest 09/11). */
  intensity: 0.55,
  /**
   * O recuo do corpo da sniper no passe do halo: a laser é montada rente ao
   * corpo, e sem recuo os dois brigariam pela profundidade e o neon piscaria.
   */
  blockerZOffset: 2,
} as const

/** Os nós do corpo da sniper, nos dois glb (`sniper.glb`, `sniper-laser.glb`). */
const GLOW_BLOCKERS: readonly string[] = ['base_sniper_0', 'scope_sniper_0']

/**
 * Verdadeiro para a peça do viewmodel que entra no halo como **parede**, preta:
 * o receptor e a luneta. Sem ela, a laser do outro lado do receptor e as
 * placas do braço atrás da arma brilhavam através do corpo da sniper. Só as
 * duas peças grandes — ~11 mil triângulos, dois draw calls, sem esqueleto —, e
 * não a arma inteira com os braços, que dobraria o custo do passe no celular
 * (ADR 0030). Por prefixo, como `keepsOwnGlow`: o glTF parte malha em
 * `<nó>_primitive0`.
 *
 * ```ts
 * blocksViewmodelGlow('base_sniper_0') // true
 * blocksViewmodelGlow('laser_emitter') // false: essa acende
 * ```
 */
export function blocksViewmodelGlow(meshName: string): boolean {
  return GLOW_BLOCKERS.some((blocker) => meshName.startsWith(blocker))
}

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
