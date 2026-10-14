import type { MeleeWeapon } from '@shobu/core'

/** Uma cor rgb linear, de 0 a 1 (acima de 1 clareia a textura que ela multiplica). */
export type FinishColor = readonly [number, number, number]

/**
 * Um acabamento de arma, a "skin" do menu de classe. São só cores: o
 * acabamento tinge os materiais que o glb já tem, e nenhum acabamento baixa
 * textura nova — a escolha não custa nada no celular.
 *
 * - `body`: a cor difusa do corpo. Na sniper ela **multiplica** a textura
 *   (acima de 1 clareia); na lâmina, que não tem textura, ela é a cor;
 * - `glow`: a luz própria dos acentos (o fio da lâmina, o filete da luva, e na
 *   sniper a luneta e o carregador). Ausente, o acento fica como veio.
 */
export interface WeaponFinish {
  readonly id: string
  readonly label: string
  readonly body?: FinishColor
  readonly glow?: FinishColor
  /** A miniatura do menu, de `scripts/blender/melee_blades.py --previa`. */
  readonly thumbnail?: string
}

/**
 * A sniper. A PRETA é a padrão e fica como o glb a traz — decisão do usuário
 * (11/10), depois de a versão colorida ter sido revertida no `6dcc558`.
 */
export const SNIPER_FINISHES: readonly WeaponFinish[] = [
  { id: 'preta', label: 'PRETA', thumbnail: 'sniper-preta' },
  {
    id: 'grafite-neon',
    label: 'GRAFITE NEON',
    body: [2.1, 2.1, 2.35],
    glow: [1, 0.16, 0.24],
    thumbnail: 'sniper-grafite-neon',
  },
  {
    id: 'carbono',
    label: 'CARBONO',
    body: [0.85, 1, 1.35],
    glow: [1, 0.84, 0.04],
    thumbnail: 'sniper-carbono',
  },
]

/**
 * As lâminas. As cores casam com as `ACABAMENTOS` do script do blender, que
 * desenha as miniaturas: mudar uma aqui pede rodar o `--previa` de novo.
 */
export const KATANA_FINISHES: readonly WeaponFinish[] = [
  { id: 'neon', label: 'AÇO NEON', thumbnail: 'katana-neon' },
  {
    id: 'obsidiana',
    label: 'OBSIDIANA',
    body: [0.03, 0.03, 0.035],
    glow: [0.2, 0.85, 1],
    thumbnail: 'katana-obsidiana',
  },
  {
    id: 'ouro',
    label: 'OURO',
    body: [0.85, 0.62, 0.22],
    glow: [1, 0.9, 0.55],
    thumbnail: 'katana-ouro',
  },
]

export const KNIFE_FINISHES: readonly WeaponFinish[] = [
  { id: 'neon', label: 'TÁTICA NEON', thumbnail: 'knife-neon' },
  {
    id: 'aco',
    label: 'AÇO',
    body: [0.62, 0.64, 0.68],
    glow: [1, 0.85, 0.2],
    thumbnail: 'knife-aco',
  },
  {
    id: 'ouro',
    label: 'OURO',
    body: [0.85, 0.62, 0.22],
    glow: [1, 0.9, 0.55],
    thumbnail: 'knife-ouro',
  },
]

export const BLADE_FINISHES: Readonly<Record<MeleeWeapon, readonly WeaponFinish[]>> = {
  katana: KATANA_FINISHES,
  knife: KNIFE_FINISHES,
}

/**
 * O acabamento do índice, ou o padrão (o primeiro) quando o índice não existe:
 * a preferência guardada pode ser de uma versão com mais acabamentos.
 *
 * ```ts
 * finishAt(SNIPER_FINISHES, 1).label // 'GRAFITE NEON'
 * ```
 */
export function finishAt(finishes: readonly WeaponFinish[], index: number): WeaponFinish {
  return finishes[index] ?? (finishes[0] as WeaponFinish)
}

/** Onde a miniatura é servida. */
export function finishThumbnailUrl(finish: WeaponFinish): string | undefined {
  return finish.thumbnail ? `/assets/images/loadout/${finish.thumbnail}.webp` : undefined
}
