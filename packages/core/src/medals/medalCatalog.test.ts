import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MEDAL_CATALOG, type MedalRarity, medalBySlug } from './medalCatalog.ts'

/**
 * O catálogo é a chave que amarra três coisas que vivem em pastas diferentes:
 * a regra, o ícone e a fala. Cada uma delas some em silêncio quando o slug
 * diverge — ícone quebrado é um retângulo vazio no hud, fala faltando é um
 * narrador mudo —, então a tranca é aqui e não em revisão de código.
 */
const REPO_ROOT = new URL('../../../../', import.meta.url)
const ICON_DIR = new URL('packages/client/public/assets/images/medals/', REPO_ROOT)
const VOICELINE_DIR = new URL('audio/voicelines/', REPO_ROOT)

const RARITY_COUNT: Readonly<Record<MedalRarity, number>> = {
  comum: 3,
  incomum: 6,
  rara: 4,
  lendaria: 4,
}

describe('catálogo de medalhas', () => {
  it('tem as dezessete da docs/medals.md', () => {
    expect(MEDAL_CATALOG).toHaveLength(17)
  })

  it('não repete slug', () => {
    const slugs = new Set(MEDAL_CATALOG.map((medal) => medal.slug))
    expect(slugs.size).toBe(MEDAL_CATALOG.length)
  })

  it.each(Object.entries(RARITY_COUNT))('tem %s medalhas: %s', (rarity, count) => {
    const medals = MEDAL_CATALOG.filter((medal) => medal.rarity === rarity)
    expect(medals).toHaveLength(count)
  })

  it('lista em ordem de raridade crescente', () => {
    const order: readonly MedalRarity[] = ['comum', 'incomum', 'rara', 'lendaria']
    const ranks = MEDAL_CATALOG.map((medal) => order.indexOf(medal.rarity))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('devolve a medalha pelo slug', () => {
    expect(medalBySlug('double-kill').rarity).toBe('incomum')
  })

  it('recusa slug fora do catálogo, dizendo qual', () => {
    // @ts-expect-error o teste é justamente o slug que o tipo não aceita.
    expect(() => medalBySlug('quadruple-kill')).toThrow(/quadruple-kill/)
  })

  it.each(MEDAL_CATALOG)('$slug tem ícone convertido em public/', ({ slug }) => {
    expect(existsSync(new URL(`${slug}.webp`, ICON_DIR))).toBe(true)
  })

  it.each(MEDAL_CATALOG)('$slug tem fala em todas as vozes do narrador', ({ slug }) => {
    for (const voice of readdirSync(VOICELINE_DIR)) {
      const manifest = readFileSync(new URL(`${voice}/manifest.json`, VOICELINE_DIR), 'utf8')
      const takes = (JSON.parse(manifest) as NarratorManifest).clips[slug]
      expect(takes?.length, `${voice} não tem take de ${slug}`).toBeGreaterThan(0)
    }
  })
})

interface NarratorManifest {
  readonly clips: Readonly<Record<string, readonly unknown[] | undefined>>
}
