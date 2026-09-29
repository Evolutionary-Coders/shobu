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
import type { GreyboxBlock } from './arenaBlock.ts'
import { layoutFingerprint } from './layoutFingerprint.ts'

/** Onde a arte da arena é servida, relativo à raiz do site. */
export const ARENA_SCENERY_DIR = '/assets/arena/'
export const ARENA_SCENERY_MANIFEST = 'ichiban-gai.json'

/**
 * Como o cliente trata cada material do glb, decidido pelo prefixo do nome que
 * o build do blender dá a ele. É um contrato entre os dois lados, e por isso
 * mora aqui e vai para o blender no json do layout:
 *
 * - `baked`: superfície da arena, cor chapada × lightmap, sem luz dinâmica;
 * - `neon`: emissivo puro, sem lightmap — é a luz, não o que a recebe;
 * - `lit`: cenário de fundo, fora da arena e fora do bake, iluminado pelo sol
 *   dinâmico, que é barato a 60 m e some na névoa.
 */
export type SceneryMaterialKind = 'baked' | 'neon' | 'lit'

export const SCENERY_MATERIAL_PREFIXES: Readonly<Record<SceneryMaterialKind, string>> = {
  baked: 'sup-',
  neon: 'neon-',
  lit: 'fundo-',
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
