/**
 * As dezessete medalhas do shōbu: slug, raridade e o rótulo que o hud escreve.
 * A tabela é a de [`docs/medals.md`](../../../../docs/medals.md), e o slug é a
 * chave que amarra as três pontas — a regra em `medalRules.ts`, o ícone em
 * `public/assets/images/medals/<slug>.webp` e a fala em
 * `audio/voicelines/<voz>/manifest.json`. `medalCatalog.test.ts` tranca as três
 * contra esta tabela.
 *
 * ```ts
 * medalBySlug('double-kill').rarity // 'incomum'
 * ```
 */
export type MedalRarity = 'comum' | 'incomum' | 'rara' | 'lendaria'

export type MedalSlug =
  | 'no-scope'
  | 'knife'
  | 'payback'
  | 'headshot'
  | 'double-kill'
  | 'first-blood'
  | 'airborne'
  | 'backstab'
  | 'skeet'
  | 'triple-kill'
  | 'longshot-no-scope'
  | 'on-the-rope'
  | 'buzzkill'
  | '360-no-scope'
  | 'overkill'
  | 'kill-chain'
  | 'collateral'

export interface Medal {
  readonly slug: MedalSlug
  readonly rarity: MedalRarity
  /** Já em caixa alta: é assim que ele entra no toast, sem o css transformar. */
  readonly label: string
}

/**
 * A ordem é a de `docs/medals.md` — raridade crescente, e dentro dela a ordem
 * em que o documento lista. É também a ordem em que duas medalhas da mesma
 * kill entram no feed, então a mais rara aparece por último e fica por cima.
 */
export const MEDAL_CATALOG: readonly Medal[] = [
  { slug: 'no-scope', rarity: 'comum', label: 'NO SCOPE' },
  { slug: 'knife', rarity: 'comum', label: 'KNIFE' },
  { slug: 'payback', rarity: 'comum', label: 'PAYBACK' },
  { slug: 'headshot', rarity: 'incomum', label: 'HEADSHOT' },
  { slug: 'double-kill', rarity: 'incomum', label: 'DOUBLE KILL' },
  { slug: 'first-blood', rarity: 'incomum', label: 'FIRST BLOOD' },
  { slug: 'airborne', rarity: 'incomum', label: 'AIRBORNE' },
  { slug: 'backstab', rarity: 'incomum', label: 'BACKSTAB' },
  { slug: 'skeet', rarity: 'incomum', label: 'SKEET' },
  { slug: 'triple-kill', rarity: 'rara', label: 'TRIPLE KILL' },
  { slug: 'longshot-no-scope', rarity: 'rara', label: 'LONGSHOT NO SCOPE' },
  { slug: 'on-the-rope', rarity: 'rara', label: 'ON THE ROPE' },
  { slug: 'buzzkill', rarity: 'rara', label: 'BUZZKILL' },
  { slug: '360-no-scope', rarity: 'lendaria', label: '360 NO SCOPE' },
  { slug: 'overkill', rarity: 'lendaria', label: 'OVERKILL' },
  { slug: 'kill-chain', rarity: 'lendaria', label: 'KILL CHAIN' },
  { slug: 'collateral', rarity: 'lendaria', label: 'COLLATERAL' },
]

const BY_SLUG = new Map<string, Medal>(MEDAL_CATALOG.map((medal) => [medal.slug, medal]))

export function medalBySlug(slug: MedalSlug): Medal {
  const medal = BY_SLUG.get(slug)
  if (!medal) throw new RangeError(`medalBySlug recebeu ${slug}; esperado um slug do catálogo`)
  return medal
}
