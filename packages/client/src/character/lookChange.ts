import type { HumanSkinId } from '@shobu/core'

/** O que o boneco de uma vaga está vestindo agora: o humano e o acento do neon. */
export interface WornLook {
  skin: HumanSkinId
  accent: number
}

/**
 * O que fazer com o boneco de uma vaga quando o visual pedido muda:
 * - `redress`: outro humano, outro glb — tira o boneco e põe o novo;
 * - `repaint`: o mesmo humano em outra cor de neon, só repinta o acento;
 * - `none`: já está vestido assim, ou uma troca ainda está a caminho.
 */
export type LookChange = 'none' | 'repaint' | 'redress'

/**
 * Decide a troca de roupa de um boneco a cada quadro. Compara campo a campo,
 * sem montar objeto: roda por vaga, por quadro. Com uma troca a caminho não
 * pede outra; quando ela chega, o quadro seguinte compara de novo, e o visual
 * que mudou no meio do download ainda vale.
 *
 * ```ts
 * lookChangeOf({ skin: 'vex', accent: 1 }, session.lookOf(bot.id), false) // 'redress' se ele virou nova
 * ```
 */
export function lookChangeOf(
  worn: Readonly<WornLook> | undefined,
  wanted: Readonly<WornLook>,
  dressing: boolean,
): LookChange {
  if (dressing) return 'none'
  if (!worn || worn.skin !== wanted.skin) return 'redress'
  return worn.accent === wanted.accent ? 'none' : 'repaint'
}
