/**
 * O manifesto da arte da arena: o que `scripts/blender/build_arena.py` grava ao
 * lado do glb (ADR 0010). Dado puro — quem baixa e desenha é
 * `renderer/loadArenaScenery.ts`.
 *
 * O campo que importa é `fingerprint`: é a impressão digital do layout com que a
 * arte foi construída. Se ela não bate com a do layout de agora, alguém mexeu
 * numa caixa de colisão sem refazer a arte, e o cliente fica com o greybox — que
 * é feio, mas é **verdadeiro**: o que se vê é o que a bala encontra.
 */
import type { GreyboxBlock } from '@shobu/core'
import { layoutFingerprint } from './layoutFingerprint.ts'

/** Onde a arte da arena é servida, relativo à raiz do site. */
export const ARENA_SCENERY_DIR = '/assets/arena/'

/**
 * Como o cliente trata cada material do glb, decidido pelo prefixo do nome que
 * o build do blender dá a ele. É um contrato entre os dois lados, e por isso
 * mora aqui e vai para o blender no json do layout:
 *
 * - `baked`: superfície da arena, cor chapada × lightmap, sem luz dinâmica;
 * - `neon`: emissivo puro, sem lightmap — é a luz, não o que a recebe;
 * - `lit`: cenário de fundo, fora da arena e fora do bake, iluminado pelo sol
 *   dinâmico, que é barato a 60 m e some na névoa;
 * - `halo`: luz **somada** por cima da cena — o brilho no ar em volta do
 *   letreiro, o reflexo dele na poça e a chuva. É o que leva o halo do neon a
 *   quem joga em DESEMPENHO, que não tem o passe de glow (ADR 0014).
 */
export type SceneryMaterialKind = 'baked' | 'neon' | 'lit' | 'halo'

export const SCENERY_MATERIAL_PREFIXES: Readonly<Record<SceneryMaterialKind, string>> = {
  baked: 'sup-',
  neon: 'neon-',
  lit: 'fundo-',
  halo: 'halo-',
}

/**
 * ```ts
 * sceneryMaterialKind('neon-magenta') // 'neon'
 * ```
 */
export function sceneryMaterialKind(materialName: string): SceneryMaterialKind {
  for (const [kind, prefix] of Object.entries(SCENERY_MATERIAL_PREFIXES)) {
    if (materialName.startsWith(prefix)) return kind as SceneryMaterialKind
  }
  throw new RangeError(
    `material ${materialName} sem prefixo conhecido; esperado ${Object.values(SCENERY_MATERIAL_PREFIXES).join(', ')}`,
  )
}

/**
 * O neon fosco: emissivo, mas fora do halo. Janela de apartamento, torre ao
 * longe e rua depois do recorte são luz, mas não letreiro — no passe do glow
 * elas borravam a cidade inteira (captura do look-dev em QUALIDADE, 11/10).
 */
export const MATTE_NEON_PREFIX = 'neon-fosco-'

/**
 * Se o material entra no halo do `GlowLayer`: letreiro, telão e tubo, sim;
 * neon fosco e tudo que não é neon, não.
 *
 * ```ts
 * sceneryGlows('neon-letreiros') // true
 * sceneryGlows('neon-fosco-janelas') // false
 * ```
 */
export function sceneryGlows(materialName: string): boolean {
  return sceneryMaterialKind(materialName) === 'neon' && !materialName.startsWith(MATTE_NEON_PREFIX)
}

/**
 * A luz de céu que o fundo recebe além do sol dinâmico, como fração da cor da
 * textura. O fundo não tem bake, então sem isto a face na sombra só tem a
 * hemisférica e sai quase preta — o prédio de verdade ao lado da rua cozida
 * parecia um buraco. 0,35 é o que deixa a sombra do fundo no mesmo valor da
 * sombra cozida da rua.
 */
export const LIT_SKY_FILL = 0.35

/**
 * O piso é a única superfície que se vê quase sempre de raspão — a rua inteira,
 * da calçada até o fim — e é nele que o filtro sem anisotropia apaga o
 * ladrilho num borrão a dez metros. Por isso ele tem filtro mínimo de 4× em
 * qualquer predefinição, DESEMPENHO inclusive: são três texturas, e é a
 * diferença mais visível do mapa (reclamação de 11/10 sobre o chão).
 */
export const GROUND_MIN_ANISOTROPY = 4

/**
 * Os materiais de piso do glb: os do Neon-kaidō (`neon_ground.FLOOR_MATERIALS`)
 * e o asfalto e a calçada do Ichiban-gai (`arena_materials.py`).
 */
const GROUND_MATERIALS: ReadonlySet<string> = new Set([
  'sup-rua',
  'sup-calcada',
  'sup-beco',
  'sup-asfalto',
])

/**
 * O filtro anisotrópico mínimo da textura de um material do cenário: o do piso,
 * ou 1 (quem decide é a predefinição).
 *
 * ```ts
 * sceneryMinAnisotropy('sup-rua') // 4
 * sceneryMinAnisotropy('sup-reboco') // 1
 * ```
 */
export function sceneryMinAnisotropy(materialName: string): number {
  return GROUND_MATERIALS.has(materialName) ? GROUND_MIN_ANISOTROPY : 1
}

/**
 * O filtro que a textura usa: o da predefinição, mas nunca abaixo do mínimo dela.
 *
 * ```ts
 * textureAnisotropy(1, 4) // 4
 * textureAnisotropy(8, 4) // 8
 * ```
 */
export function textureAnisotropy(presetLevel: number, minimum: number | undefined): number {
  return Math.max(presetLevel, minimum ?? 1)
}

export interface ArenaSceneryManifest {
  readonly fingerprint: string
  readonly glb: string
  readonly lightmap: string
  /** O `level` do lightmap no babylon: a codificação guarda luz até 2^2,2 em 8 bits. */
  readonly lightmapLevel: number
  readonly triangles: number
}

/**
 * Valida o json do manifesto. Chave faltando ou do tipo errado é erro com o
 * campo e o valor, pelo mesmo motivo que a configuração de gameplay é validada:
 * erro de digitação que passa em silêncio vira arena preta sem mensagem.
 *
 * ```ts
 * parseArenaSceneryManifest(await response.json())
 * ```
 */
export function parseArenaSceneryManifest(raw: unknown): ArenaSceneryManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError(`manifesto da arena recebeu ${JSON.stringify(raw)}; esperado um objeto`)
  }
  const record = raw as Record<string, unknown>
  return {
    fingerprint: requireString(record, 'fingerprint'),
    glb: requireString(record, 'glb'),
    lightmap: requireString(record, 'lightmap'),
    lightmapLevel: requirePositive(record, 'lightmapLevel'),
    triangles: requirePositive(record, 'triangles'),
  }
}

/**
 * ```ts
 * sceneryMatchesLayout(manifest, ICHIBAN_GAI_BLOCKOUT) // true se a arte está em dia
 * ```
 */
export function sceneryMatchesLayout(
  manifest: ArenaSceneryManifest,
  blockout: readonly GreyboxBlock[],
): boolean {
  return manifest.fingerprint === layoutFingerprint(blockout)
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value === 'string' && value.length > 0) return value
  throw new TypeError(`manifesto da arena: ${key} recebeu ${JSON.stringify(value)}; esperado texto`)
}

function requirePositive(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value === 'number' && value > 0) return value
  throw new TypeError(
    `manifesto da arena: ${key} recebeu ${JSON.stringify(value)}; esperado número > 0`,
  )
}
