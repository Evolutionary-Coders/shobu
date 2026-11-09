import { readFileSync } from 'node:fs'
import { SCORESTREAK_TIER_ACCENT, type ScorestreakTier } from '@shobu/core'
import { describe, expect, it } from 'vitest'

/**
 * A cor de cada peso vive no core (`SCORESTREAK_TIER_ACCENT`), que pinta a
 * borda do svg; o `bootScorestreaks.css` repete o hex para o contorno e o
 * número da linha, porque css não importa ts. Antes eram duas cópias soltas
 * (o script e o css): trocar uma deixava o brilho do cartão de outra cor que a
 * borda desenhada. Este teste é a tranca entre as duas.
 */
const css = readFileSync(new URL('./bootScorestreaks.css', import.meta.url), 'utf8')

/** O hex de `--tier` na regra `.streak-card[data-tier="<tier>"]`, ou undefined. */
function cssTierAccent(tier: ScorestreakTier): string | undefined {
  const rule = new RegExp(
    `\\.streak-card\\[data-tier="${tier}"\\]\\s*\\{\\s*--tier:\\s*(#[0-9a-fA-F]{3,8});`,
  )
  return rule.exec(css)?.[1]?.toLowerCase()
}

describe('a cor do peso no css é a do core', () => {
  const tiers = Object.entries(SCORESTREAK_TIER_ACCENT) as [ScorestreakTier, string][]

  it.each(tiers)('%s: --tier é %s', (tier, accent) => {
    expect(cssTierAccent(tier), `bootScorestreaks.css sem --tier ${accent} para ${tier}`).toBe(
      accent.toLowerCase(),
    )
  })
})
