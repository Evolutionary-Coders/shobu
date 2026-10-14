import { describe, expect, it } from 'vitest'
import {
  MATCH_OVER_TITLE,
  type MatchEndScreen,
  MVP_TITLE,
  type VoteOptionView,
} from '../matchEnd/matchEndScreen.ts'
import type { VisorOp } from './visorDraw.ts'
import { matchEndOps } from './visorMatchEndOps.ts'
import { VISOR_PALETTE } from './visorPalette.ts'

const SIZE = { width: 1024, height: 640 } as const

function option(over: Partial<VoteOptionView> = {}): VoteOptionView {
  return {
    label: 'NEON-KAIDŌ',
    votes: 0,
    voters: [],
    mine: false,
    focused: false,
    winner: false,
    ...over,
  }
}

const SCREEN: MatchEndScreen = {
  phase: 'results',
  secondsLeft: 7,
  mvp: {
    name: 'VEX',
    portraitUrl: '/vex.webp',
    local: false,
    points: 900,
    kills: 7,
    deaths: 2,
    bestStreak: 4,
    medals: 6,
  },
  standings: [
    { rank: 1, name: 'VEX', points: 900, kills: 7, deaths: 2, local: false },
    { rank: 2, name: 'NICO', points: 300, kills: 3, deaths: 5, local: true },
  ],
  options: [
    option({ focused: true }),
    option({ label: 'ICHIBAN-GAI', mine: true, votes: 2, voters: ['NICO', 'ONI'] }),
    option({ label: 'ALEATÓRIO' }),
  ],
  nextMapLabel: undefined,
}

function texts(ops: readonly VisorOp[]): string[] {
  return ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []))
}

function textOp(ops: readonly VisorOp[], value: string): Extract<VisorOp, { kind: 'text' }> {
  const found = ops.find((op) => op.kind === 'text' && op.text === value)
  if (found?.kind !== 'text') throw new Error(`sem o texto '${value}' no visor`)
  return found
}

describe('matchEndOps', () => {
  it('no congelamento, só FIM DE PARTIDA', () => {
    expect(texts(matchEndOps({ ...SCREEN, phase: 'over' }, SIZE))).toEqual([MATCH_OVER_TITLE])
  })

  it('na tela de MVP: título, contagem, nome, retrato e os números', () => {
    const ops = matchEndOps(SCREEN, SIZE)
    expect(texts(ops)).toEqual(expect.arrayContaining([MVP_TITLE, '07', 'VEX', '900', '4', '6']))
    expect(ops).toContainEqual(expect.objectContaining({ kind: 'image', url: '/vex.webp' }))
  })

  it('o jogador como MVP sai em amarelo, e sem retrato não desenha imagem', () => {
    const mvp = { ...(SCREEN.mvp as NonNullable<MatchEndScreen['mvp']>), name: 'NICO', local: true }
    const ops = matchEndOps({ ...SCREEN, mvp: { ...mvp, portraitUrl: undefined } }, SIZE)
    expect(ops.filter((op) => op.kind === 'text' && op.text === 'NICO')[0]).toMatchObject({
      color: VISOR_PALETTE.yellow,
    })
    expect(ops.some((op) => op.kind === 'image')).toBe(false)
  })

  it('sem MVP, a tela continua com o placar e o voto', () => {
    expect(texts(matchEndOps({ ...SCREEN, mvp: undefined }, SIZE))).toContain('2 ICHIBAN-GAI')
  })

  it('o placar final, com o jogador em amarelo', () => {
    const ops = matchEndOps(SCREEN, SIZE)
    expect(textOp(ops, '3/5').color).toBe(VISOR_PALETTE.grey)
    expect(ops.filter((op) => op.kind === 'text' && op.text === 'NICO')[0]).toMatchObject({
      color: VISOR_PALETTE.yellow,
    })
  })

  it('o voto: o foco marcado, o voto do jogador em amarelo, e quem votou', () => {
    const ops = matchEndOps(SCREEN, SIZE)
    expect(textOp(ops, '▸ 1 NEON-KAIDŌ').color).toBe(VISOR_PALETTE.white)
    expect(textOp(ops, '2 ICHIBAN-GAI').color).toBe(VISOR_PALETTE.yellow)
    expect(textOp(ops, '3 ALEATÓRIO').color).toBe(VISOR_PALETTE.grey)
    expect(texts(ops)).toContain('NICO · ONI')
  })

  it('com o voto fechado: o vencedor em vermelho, o mapa que vem, e a contagem em zero', () => {
    const decided: MatchEndScreen = {
      ...SCREEN,
      phase: 'decided',
      options: [option({ winner: true, mine: true }), option({ label: 'ICHIBAN-GAI' })],
      nextMapLabel: 'NEON-KAIDŌ',
    }
    const ops = matchEndOps(decided, SIZE)
    expect(textOp(ops, '1 NEON-KAIDŌ').color).toBe(VISOR_PALETTE.red)
    expect(texts(ops)).toEqual(expect.arrayContaining(['PRÓXIMO MAPA: NEON-KAIDŌ', '00']))
  })

  it('sem opções, o voto não divide por zero', () => {
    expect(texts(matchEndOps({ ...SCREEN, options: [] }, SIZE))).toContain('PRÓXIMO MAPA')
  })
})
