import type { PrimaryWeapon } from '@shobu/core'
import type { FinishColor } from '../loadout/weaponFinishes.ts'

/**
 * As cores do feixe de cada arma principal (`tracerBeams.ts`), em rgb de 0 a
 * 1. O brilho é o halo aditivo da textura de perfil, e não a `GlowLayer`: lê
 * igual em todo preset da ADR 0014, inclusive no DESEMPENHO e no celular, onde
 * a camada de brilho está desligada.
 */
export interface TracerStyle {
  /** O núcleo fino, que pisca: é o tiro. */
  readonly core: FinishColor
  /** O ar em volta, largo e colorido: é o neon. */
  readonly halo: FinishColor
  /** O risco curto que corre do cano ao impacto. */
  readonly head: FinishColor
  /** Quanto o halo é mais largo que o de sempre (`HALO_WIDTH_M`). */
  readonly haloWidthScale: number
}

/**
 * - **classic**: o feixe de sempre, número por número — já era um halo
 *   vermelho de neon em volta de um núcleo de metal incandescente.
 * - **laser**: neon vermelho #ff2a3d no halo, um pouco mais largo, e o núcleo
 *   rosa quase branco: é luz, não metal.
 *
 * ```ts
 * TRACER_STYLES[session.primaryWeaponOf(bot.id)].halo // [1, 0.165, 0.239]
 * ```
 */
export const TRACER_STYLES: Readonly<Record<PrimaryWeapon, TracerStyle>> = {
  classic: {
    core: [1, 0.93, 0.8],
    halo: [1, 0.22, 0.28],
    head: [1, 0.97, 0.9],
    haloWidthScale: 1,
  },
  laser: {
    core: [1, 0.78, 0.82],
    halo: [0xff / 255, 0x2a / 255, 0x3d / 255],
    head: [1, 0.88, 0.9],
    haloWidthScale: 1.2,
  },
}
