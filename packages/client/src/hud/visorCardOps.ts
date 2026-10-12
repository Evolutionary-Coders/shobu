import type { KillWeapon } from '@shobu/core'
import type { KillCard } from './killCards.ts'
import { killIcon } from './killIcons.ts'
import type { KillTag } from './killTags.ts'
import { text, type VisorOp } from './visorDraw.ts'
import { VISOR_PALETTE, type VisorColor } from './visorPalette.ts'

/**
 * Os cartões de abate no visor do óculos (ADR 0012): a tela de morte e o
 * cartão de abate do desktop, redesenhados em operações de canvas. O mesmo
 * `KillCard`, a mesma ordem — retrato, nome, arma e marcas, distância —, em
 * tamanho que a lente do cardboard lê.
 */

/** Espaço entre dois ícones da fileira, em px do visor. */
const ICON_GAP_PX = 8

/** A cor de cada ícone no visor: a arma no branco do nome, a cabeça no vermelho. */
function iconColor(id: KillWeapon | KillTag): VisorColor {
  if (id === 'headshot') return VISOR_PALETTE.red
  if (id === 'sniper' || id === 'knife' || id === 'katana') return VISOR_PALETTE.white
  return VISOR_PALETTE.yellow
}

export interface IconRow {
  readonly ops: readonly VisorOp[]
  /** Onde a fileira terminou: o que vem depois dela começa aqui. */
  readonly endX: number
}

/**
 * A arma e as marcas lado a lado, com o topo em `y`. Cada ícone ocupa a
 * largura da sua proporção na altura pedida.
 *
 * ```ts
 * iconRowOps('sniper', ['headshot'], 400, 236, 26).endX // 400 + 69 + 8 + 26
 * ```
 */
export function iconRowOps(
  weapon: KillWeapon,
  tags: readonly KillTag[],
  x: number,
  y: number,
  height: number,
): IconRow {
  const ops: VisorOp[] = []
  let cursor = x
  for (const id of [weapon, ...tags]) {
    const icon = killIcon(id)
    ops.push({ kind: 'icon', id, x: cursor, y, height, color: iconColor(id) })
    cursor += (icon.width * height) / icon.height + ICON_GAP_PX
  }
  return { ops, endX: cursor - ICON_GAP_PX }
}

/** A placa da tela de morte, no alto do centro, acima da retícula. */
const DEATH_PLATE = { x: 252, y: 130, width: 520, height: 172 } as const
const PORTRAIT_PX = 120
const PAD_PX = 16

/**
 * A tela de morte no óculos: a placa, o retrato à esquerda, e à direita
 * "ELIMINADO POR", o nome, e a fileira de ícones com a distância.
 *
 * ```ts
 * deathCardOps(killCardOf(cause, 'NEON KITSUNE', url))
 * ```
 */
export function deathCardOps(card: KillCard): readonly VisorOp[] {
  const { x, y } = DEATH_PLATE
  const portrait: VisorOp[] =
    card.portraitUrl === undefined
      ? []
      : [{ kind: 'image', url: card.portraitUrl, x: x + PAD_PX, y: y + 26, size: PORTRAIT_PX }]
  const left = x + PAD_PX + (portrait.length > 0 ? PORTRAIT_PX + PAD_PX : 0)
  const row = iconRowOps(card.weapon, card.tags, left, y + 106, 28)
  return [
    { kind: 'plate', ...DEATH_PLATE },
    ...portrait,
    text(left, y + 40, 'ELIMINADO POR', 22, VISOR_PALETTE.red, 'left', 'tech'),
    text(left, y + 92, card.name, 44, VISOR_PALETTE.white, 'left', 'tech'),
    ...row.ops,
    text(row.endX + 14, y + 130, card.distance, 24, VISOR_PALETTE.grey, 'left', 'mono'),
  ]
}

/** O cartão de abate, embaixo no centro: entre o gancho e a arma, abaixo da mira. */
const BANNER_PLATE = { x: 312, y: 468, width: 400, height: 100 } as const
const BANNER_PORTRAIT_PX = 76

/**
 * O cartão de abate no óculos: a placa, o retrato, "ABATIDO", o nome e a
 * fileira de ícones com a distância.
 *
 * ```ts
 * killBannerOps(killCardOf(notice, 'HEXKILL', url))
 * ```
 */
export function killBannerOps(card: KillCard): readonly VisorOp[] {
  const { x, y } = BANNER_PLATE
  const portrait: VisorOp[] =
    card.portraitUrl === undefined
      ? []
      : [{ kind: 'image', url: card.portraitUrl, x: x + 12, y: y + 12, size: BANNER_PORTRAIT_PX }]
  const left = x + 12 + (portrait.length > 0 ? BANNER_PORTRAIT_PX + 14 : 0)
  const row = iconRowOps(card.weapon, card.tags, left, y + 66, 20)
  return [
    { kind: 'plate', ...BANNER_PLATE },
    ...portrait,
    text(left, y + 26, 'ABATIDO', 18, VISOR_PALETTE.yellow, 'left', 'tech'),
    text(left, y + 58, card.name, 32, VISOR_PALETTE.white, 'left', 'tech'),
    ...row.ops,
    text(row.endX + 12, y + 84, card.distance, 20, VISOR_PALETTE.grey, 'left', 'mono'),
  ]
}
