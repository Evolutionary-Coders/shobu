import { describe, expect, it } from 'vitest'
import { parseClassLoadout } from './classLoadout.ts'
import { loadoutPreviewOf } from './loadoutPreview.ts'

const loadout = { ...parseClassLoadout(null), melee: 1, sniperFinish: 2, knifeFinish: 1 }

describe('loadoutPreviewOf', () => {
  it('a arma principal e a skin dela mostram a sniper no acabamento', () => {
    for (const row of [0, 2]) {
      expect(loadoutPreviewOf(loadout, row)).toEqual({
        thumbnailUrl: '/assets/images/loadout/sniper-carbono.webp',
        caption: 'SNIPER · CARBONO',
      })
    }
  })

  it('o corpo a corpo mostra a lâmina da classe; cada linha de lâmina, a dela', () => {
    expect(loadoutPreviewOf(loadout, 1).caption).toBe('FACA · AÇO')
    expect(loadoutPreviewOf({ ...loadout, melee: 0 }, 1).caption).toBe('KATANA · AÇO NEON')
    expect(loadoutPreviewOf(loadout, 3).thumbnailUrl).toContain('katana-neon')
    expect(loadoutPreviewOf(loadout, 4).thumbnailUrl).toContain('knife-aco')
  })

  it('a skin de personagem mostra só o nome; VOLTAR mostra a sniper', () => {
    expect(loadoutPreviewOf(loadout, 5)).toEqual({ thumbnailUrl: undefined, caption: 'PADRÃO' })
    expect(loadoutPreviewOf(loadout, 6).caption).toBe('SNIPER · CARBONO')
  })
})
