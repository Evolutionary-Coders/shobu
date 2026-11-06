import { PRIMARY_WEAPONS } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  BLADE_FINISHES,
  finishAt,
  finishById,
  finishThumbnailUrl,
  KATANA_FINISHES,
  primaryThumbnailUrl,
  SNIPER_FINISHES,
  sniperSkinUrls,
  type WeaponFinish,
} from './weaponFinishes.ts'

describe('weaponFinishes', () => {
  /** Decisão do usuário (11/10): a sniper padrão continua preta, como o glb a traz. */
  it('a sniper padrão é a preta, sem tinta nenhuma', () => {
    expect(SNIPER_FINISHES[0]).toMatchObject({ id: 'preta', label: 'PRETA' })
    expect(SNIPER_FINISHES[0]?.body).toBeUndefined()
    expect(sniperSkinUrls('classic', SNIPER_FINISHES[0] as WeaponFinish)).toBeUndefined()
    expect(sniperSkinUrls('laser', SNIPER_FINISHES[0] as WeaponFinish)).toBeUndefined()
  })

  /** O menu guarda a posição: a 1 era a GRAFITE NEON, e quem a tinha vê a KAGE. */
  it('a ordem do catálogo é a que o menu guarda', () => {
    expect(SNIPER_FINISHES.map((finish) => finish.label)).toEqual([
      'PRETA',
      'KAGE DIGITAL',
      'CARBONO',
      'HOLO KOI',
    ])
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

  /** Regressão: a clássica continua nas miniaturas `sniper-*` que o 7006265 desenhou. */
  it.each(SNIPER_FINISHES.map((finish) => finish.id))(
    'a miniatura da sniper %s sai por arma principal',
    (id) => {
      const finish = SNIPER_FINISHES.find((candidate) => candidate.id === id) as WeaponFinish
      expect(primaryThumbnailUrl('classic', finish)).toBe(
        `/assets/images/loadout/sniper-${id}.webp`,
      )
      expect(primaryThumbnailUrl('laser', finish)).toBe(`/assets/images/loadout/laser-${id}.webp`)
    },
  )
})

describe('finishById', () => {
  it('acha o acabamento pelo id que a sala replica', () => {
    expect(finishById(SNIPER_FINISHES, 'kage').label).toBe('KAGE DIGITAL')
  })

  /**
   * O catálogo muda entre versões: um id desconhecido não pode pintar outro
   * acabamento. A `grafite-neon` saiu do catálogo em 06/11, trocada pela KAGE.
   */
  it.each(['', 'ouro-velho', 'grafite-neon'])('com o id %j, cai no padrão', (id) => {
    expect(finishById(SNIPER_FINISHES, id)).toBe(SNIPER_FINISHES[0])
  })
})

describe('sniperSkinUrls', () => {
  const textured = SNIPER_FINISHES.filter((finish) => finish.textured)

  it.each(PRIMARY_WEAPONS)(
    'todo acabamento texturizado tem atlas e máscara na arma %s',
    (primary) => {
      for (const finish of textured) {
        const prefix = primary === 'laser' ? 'laser' : 'sniper'
        expect(sniperSkinUrls(primary, finish)?.body).toEqual({
          base: `/assets/viewmodel/finishes/${prefix}-${finish.id}.webp`,
          glow: `/assets/viewmodel/finishes/${prefix}-${finish.id}-glow.webp`,
        })
      }
    },
  )

  it('só a HANABI troca a paleta do neon, e só no acabamento que a troca', () => {
    const holo = finishById(SNIPER_FINISHES, 'holo')
    expect(sniperSkinUrls('laser', holo)?.palette).toEqual({
      base: '/assets/viewmodel/finishes/laser-palette-holo.webp',
      glow: '/assets/viewmodel/finishes/laser-palette-holo-glow.webp',
    })
    expect(sniperSkinUrls('classic', holo)?.palette).toBeUndefined()
    expect(sniperSkinUrls('laser', finishById(SNIPER_FINISHES, 'kage'))?.palette).toBeUndefined()
  })
})
