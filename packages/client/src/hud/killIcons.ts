import type { KillWeapon } from '@shobu/core'
import { KILL_TAG_LABELS, KILL_WEAPON_LABELS, type KillTag } from './killTags.ts'

/**
 * Os ícones das kills como dado: o desenho de cada arma e de cada marca, em
 * traço de svg. Quem monta o `<svg>` é `killIconDom.ts`; o visor do óculos
 * desenha os mesmos caminhos num canvas (`Path2D`), e é por isso que o
 * desenho mora aqui e não no html.
 *
 * **Traço reto, sem curva onde não precisa, e alinhado à grade de 1 px** do
 * `viewBox`: na altura de 12–14 px do killfeed, diagonal e curva borram. É o
 * mesmo vocabulário da retícula e do hitmarker (index.html) — traço fino,
 * quina em ângulo, nada de silhueta cheia de detalhe.
 */
export type KillIconId = KillWeapon | KillTag

/** Um traço do ícone: contorno (`stroke`) ou mancha cheia (`fill`). */
export interface KillIconPath {
  readonly d: string
  readonly paint: 'stroke' | 'fill'
}

export interface KillIcon {
  readonly id: KillIconId
  /** O `<title>` e o `aria-label`: o ícone é imagem, e o leitor de tela lê isto. */
  readonly label: string
  readonly width: number
  readonly height: number
  readonly paths: readonly KillIconPath[]
}

/** As armas são largas (32×12), como as silhuetas de killfeed de todo fps. */
const WEAPON_SIZE = { width: 32, height: 12 } as const
/** As marcas são quadradas, menores que a arma: a arma é o substantivo, elas o adjetivo. */
const TAG_SIZE = { width: 12, height: 12 } as const

const stroke = (d: string): KillIconPath => ({ d, paint: 'stroke' })
const fill = (d: string): KillIconPath => ({ d, paint: 'fill' })

const PATHS: Readonly<Record<KillIconId, readonly KillIconPath[]>> = {
  // coronha, corpo, cano comprido e a luneta em cima: a sniper do jogo.
  sniper: [
    fill('M1 7 L5 6 H21 V8 H11 L9 10 H4 L1 9 Z'),
    stroke('M21 6.5 H31'),
    fill('M10 2.5 H18 V4.5 H10 Z'),
    stroke('M12 4.5 V6 M16 4.5 V6'),
  ],
  // cabo, guarda e lâmina curta com a ponta.
  knife: [fill('M3 5 H11 V8 H3 Z'), stroke('M11.5 3 V10'), fill('M12 5 H25 L30 6.5 L12 8 Z')],
  // cabo comprido, a tsuba e a lâmina longa, quase reta: a katana.
  katana: [fill('M1 7 H9 V9 H1 Z'), stroke('M9.5 5 V11'), fill('M10 7 H27 L31 5.5 L28 8.5 H10 Z')],
  // a cabeça na mira: o círculo e a cruz que passa por ele.
  headshot: [
    stroke('M3 6 A3 3 0 1 0 9 6 A3 3 0 1 0 3 6 Z'),
    stroke('M6 0.5 V3 M6 9 V11.5 M0.5 6 H3 M9 6 H11.5'),
  ],
  // a lente da luneta com a cruz dentro.
  scoped: [
    stroke('M1.5 6 A4.5 4.5 0 1 0 10.5 6 A4.5 4.5 0 1 0 1.5 6 Z'),
    stroke('M6 2.5 V9.5 M2.5 6 H9.5'),
  ],
  // a mesma lente, riscada.
  noscope: [stroke('M1.5 6 A4.5 4.5 0 1 0 10.5 6 A4.5 4.5 0 1 0 1.5 6 Z'), stroke('M2 10 L10 2')],
  // duas setas para cima: os pés fora do chão.
  airborne: [stroke('M2 6 L6 2 L10 6'), stroke('M2 10 L6 6 L10 10')],
  // o gancho: o olhal da corda em cima, a haste, e as duas pontas farpadas.
  // a curva e o olhal são o que o separam de uma seta para baixo.
  grapple: [
    stroke('M4.5 2 A1.5 1.5 0 1 0 7.5 2 A1.5 1.5 0 1 0 4.5 2 Z'),
    stroke('M6 3.5 V11'),
    stroke('M1.5 5.5 V7.5 Q1.5 11 6 11 Q10.5 11 10.5 7.5 V5.5'),
    stroke('M0.5 6.5 L1.5 5.5 L2.5 6.5 M9.5 6.5 L10.5 5.5 L11.5 6.5'),
  ],
}

function iconOf(id: KillIconId, label: string, size: typeof WEAPON_SIZE | typeof TAG_SIZE) {
  return { id, label, ...size, paths: PATHS[id] }
}

/**
 * O ícone de uma arma ou de uma marca.
 *
 * ```ts
 * killIcon('sniper').label   // 'SNIPER'
 * killIcon('headshot').width // 12
 * ```
 */
export function killIcon(id: KillIconId): KillIcon {
  if (id in KILL_WEAPON_LABELS) {
    return iconOf(id, KILL_WEAPON_LABELS[id as KillWeapon], WEAPON_SIZE)
  }
  return iconOf(id, KILL_TAG_LABELS[id as KillTag], TAG_SIZE)
}

/** Todos, na ordem: as armas e depois as marcas. Para o teste e para pré-montar. */
export const KILL_ICON_IDS: readonly KillIconId[] = Object.keys(PATHS) as KillIconId[]
