import { describe, expect, it } from 'vitest'
import type { KillCard } from './killCards.ts'
import { killIcon } from './killIcons.ts'
import { deathCardOps, iconRowOps } from './visorCardOps.ts'
import type { VisorOp } from './visorDraw.ts'
import { VISOR_PALETTE } from './visorPalette.ts'

const CARD: KillCard = {
  name: 'NEON KITSUNE',
  portraitUrl: '/kitsune.webp',
  weapon: 'sniper',
  tags: ['headshot', 'scoped'],
  distance: '87 M',
}

function kinds(ops: readonly VisorOp[]): string[] {
  return ops.map((op) => op.kind)
}

function firstTextX(ops: readonly VisorOp[]): number {
  const found = ops.find((op) => op.kind === 'text')
  if (found?.kind !== 'text') throw new Error('o cartão não tem texto')
  return found.x
}

describe('iconRowOps', () => {
  it('põe os ícones lado a lado, cada um na largura da sua proporção', () => {
    const row = iconRowOps('sniper', ['headshot'], 100, 50, 24)
    const sniperWidth = (killIcon('sniper').width * 24) / killIcon('sniper').height
    expect(row.ops).toEqual([
      { kind: 'icon', id: 'sniper', x: 100, y: 50, height: 24, color: VISOR_PALETTE.white },
      {
        kind: 'icon',
        id: 'headshot',
        x: 100 + sniperWidth + 8,
        y: 50,
        height: 24,
        color: VISOR_PALETTE.red,
      },
    ])
    expect(row.endX).toBe(100 + sniperWidth + 8 + 24)
  })

  it('as marcas que não são a cabeça saem no amarelo do registro', () => {
    const [, tag] = iconRowOps('katana', ['airborne'], 0, 0, 12).ops
    expect(tag).toMatchObject({ color: VISOR_PALETTE.yellow })
  })
})

describe('deathCardOps', () => {
  it('desenha a placa, o retrato, o nome, os ícones e a distância, nessa ordem', () => {
    expect(kinds(deathCardOps(CARD))).toEqual([
      'plate',
      'image',
      'text',
      'text',
      'icon',
      'icon',
      'icon',
      'text',
    ])
  })

  /** Sem retrato, o texto encosta na placa em vez de deixar o buraco dele. */
  it('sem retrato, o texto anda para a esquerda', () => {
    const bare = deathCardOps({ ...CARD, portraitUrl: undefined })
    expect(kinds(bare)).not.toContain('image')
    expect(firstTextX(bare)).toBeLessThan(firstTextX(deathCardOps(CARD)))
  })
})
