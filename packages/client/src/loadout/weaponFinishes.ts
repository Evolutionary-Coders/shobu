import type { MeleeWeapon, PrimaryWeapon } from '@shobu/core'

/** Uma cor rgb linear, de 0 a 1 (acima de 1 clareia a textura que ela multiplica). */
export type FinishColor = readonly [number, number, number]

/**
 * Um acabamento de arma, a "skin" do menu de classe.
 *
 * Na lâmina são só cores, que tingem os materiais que o glb já tem. Na sniper,
 * a cor sozinha não aparecia (a textura do corpo é quase preta, e 2× de quase
 * preto continua preto — diagnóstico de 03/11): cada acabamento texturizado
 * tem um atlas do corpo por arma, pintado pelo `sniper_finishes.py`, e só o
 * escolhido é baixado (`sniperSkinUrls`). A PRETA não baixa nada.
 *
 * - `body`: na lâmina, a cor do corpo; na sniper, só o tom que **multiplica** o
 *   rifle em terceira pessoa (`writeRifleTint`), que não tem atlas;
 * - `glow`: a luz própria dos acentos da lâmina (o fio, o filete da luva).
 *   Ausente, o acento fica como veio.
 */
export interface WeaponFinish {
  readonly id: string
  readonly label: string
  readonly body?: FinishColor
  readonly glow?: FinishColor
  /**
   * A miniatura do menu, de `scripts/blender/melee_blades.py --previa`. Só nas
   * lâminas: a da sniper depende também da arma principal (`primaryThumbnailUrl`).
   */
  readonly thumbnail?: string
  /** Sniper: tem atlas do corpo e máscara de luz próprios, um por arma principal. */
  readonly textured?: boolean
  /** Sniper: troca a cor do neon da HANABI pela paleta `laser-palette-<id>`. */
  readonly recoloursNeon?: boolean
}

/**
 * A sniper. A PRETA é a padrão e fica como o glb a traz — decisão do usuário
 * (11/10), depois de a versão colorida ter sido revertida no `6dcc558`.
 *
 * O menu guarda o acabamento pela **posição** (`classLoadout.ts`): a KAGE
 * DIGITAL tomou a posição 1 da GRAFITE NEON, e quem a tinha guardada vê a
 * KAGE. A sala replica pelo **id** (`isSniperFinishId`), e um id que este
 * catálogo não tem mais cai na PRETA (`finishById`). Os ids e a ordem casam
 * com os `ACABAMENTOS` do `sniper_finishes.py`.
 */
export const SNIPER_FINISHES: readonly WeaponFinish[] = [
  { id: 'preta', label: 'PRETA' },
  { id: 'kage', label: 'KAGE DIGITAL', textured: true, body: [1.9, 1.4, 1.5] },
  {
    id: 'carbono',
    label: 'CARBONO',
    textured: true,
    recoloursNeon: true,
    body: [0.85, 1, 1.35],
  },
  {
    id: 'holo',
    label: 'HOLO KOI',
    textured: true,
    recoloursNeon: true,
    body: [1.6, 1, 2.4],
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
 * finishAt(SNIPER_FINISHES, 1).label // 'KAGE DIGITAL'
 * ```
 */
export function finishAt(finishes: readonly WeaponFinish[], index: number): WeaponFinish {
  return finishes[index] ?? (finishes[0] as WeaponFinish)
}

/**
 * O acabamento pelo id, como a sala o replica (`COSMETIC_LOADOUT_MESSAGE`), ou
 * o padrão (o primeiro) para um id que este cliente não conhece: vazio, ou de
 * outra versão do catálogo. Não aloca: roda por rival, por quadro.
 *
 * ```ts
 * finishById(SNIPER_FINISHES, 'carbono').label // 'CARBONO'
 * finishById(SNIPER_FINISHES, '').label // 'PRETA'
 * ```
 */
export function finishById(finishes: readonly WeaponFinish[], id: string): WeaponFinish {
  for (const finish of finishes) if (finish.id === id) return finish
  return finishes[0] as WeaponFinish
}

/**
 * O começo do nome de cada arquivo de arma principal — miniatura e atlas: a
 * clássica é a `sniper-*` de sempre.
 */
const PRIMARY_FILE_PREFIX: Readonly<Record<PrimaryWeapon, string>> = {
  laser: 'laser',
  classic: 'sniper',
}

/**
 * A miniatura da arma principal no acabamento: uma por arma e acabamento, com
 * o id do acabamento no nome.
 *
 * ```ts
 * primaryThumbnailUrl('laser', finishAt(SNIPER_FINISHES, 2)) // '/assets/images/loadout/laser-carbono.webp'
 * ```
 */
export function primaryThumbnailUrl(primary: PrimaryWeapon, finish: WeaponFinish): string {
  return `/assets/images/loadout/${PRIMARY_FILE_PREFIX[primary]}-${finish.id}.webp`
}

/** Onde os atlas dos acabamentos da sniper são servidos (`sniper_finishes.py`). */
const SNIPER_FINISH_DIR = '/assets/viewmodel/finishes/'

/** Uma textura e a emissiva que anda com ela. */
export interface TexturePairUrls {
  readonly base: string
  readonly glow: string
}

/**
 * O que a sniper baixa num acabamento: o atlas do corpo e a máscara de luz
 * dele, e, na HANABI de um acabamento que troca o neon, a paleta do neon.
 */
export interface SniperSkinUrls {
  readonly body: TexturePairUrls
  readonly palette?: TexturePairUrls
}

/**
 * Os arquivos do acabamento na arma, ou `undefined` para o que não tem atlas
 * (a PRETA): aí a arma volta às texturas do glb.
 *
 * ```ts
 * sniperSkinUrls('laser', finishById(SNIPER_FINISHES, 'holo'))?.palette?.base
 * // '/assets/viewmodel/finishes/laser-palette-holo.webp'
 * ```
 */
export function sniperSkinUrls(
  primary: PrimaryWeapon,
  finish: WeaponFinish,
): SniperSkinUrls | undefined {
  if (!finish.textured) return undefined
  const body = pairUrls(`${PRIMARY_FILE_PREFIX[primary]}-${finish.id}`)
  // só a HANABI tem o neon da paleta: a clássica não tem peça `laser_*`.
  if (primary !== 'laser' || !finish.recoloursNeon) return { body }
  return { body, palette: pairUrls(`laser-palette-${finish.id}`) }
}

function pairUrls(name: string): TexturePairUrls {
  return { base: `${SNIPER_FINISH_DIR}${name}.webp`, glow: `${SNIPER_FINISH_DIR}${name}-glow.webp` }
}

/** Onde a miniatura da lâmina é servida. */
export function finishThumbnailUrl(finish: WeaponFinish): string | undefined {
  return finish.thumbnail ? `/assets/images/loadout/${finish.thumbnail}.webp` : undefined
}
