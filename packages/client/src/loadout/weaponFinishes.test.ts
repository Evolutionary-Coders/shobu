import { describe, expect, it } from 'vitest'
import {
  BLADE_FINISHES,
  finishAt,
  finishThumbnailUrl,
  KATANA_FINISHES,
  SNIPER_FINISHES,
} from './weaponFinishes.ts'

describe('weaponFinishes', () => {
  /** Decisão do usuário (11/10): a sniper padrão continua preta, como o glb a traz. */
  it('a sniper padrão é a preta, sem tinta nenhuma', () => {
    expect(SNIPER_FINISHES[0]).toMatchObject({ id: 'preta', label: 'PRETA' })
    expect(SNIPER_FINISHES[0]?.body).toBeUndefined()
  })

  it('cada arma tem ids únicos e mais de um acabamento', () => {
    for (const finishes of [SNIPER_FINISHES, ...Object.values(BLADE_FINISHES)]) {
      expect(new Set(finishes.map((finish) => finish.id)).size).toBe(finishes.length)
      expect(finishes.length).toBeGreaterThan(1)
    }
  })

  it('índice que não existe cai no padrão', () => {
    expect(finishAt(KATANA_FINISHES, 1).id).toBe('obsidiana')
    expect(finishAt(KATANA_FINISHES, 99).id).toBe('neon')
  })

  it('a miniatura sai da pasta do menu de classe; sem miniatura, nada', () => {
    expect(finishThumbnailUrl(KATANA_FINISHES[0] as (typeof KATANA_FINISHES)[number])).toBe(
      '/assets/images/loadout/katana-neon.webp',
    )
    expect(finishThumbnailUrl({ id: 'x', label: 'X' })).toBeUndefined()
  })
})
