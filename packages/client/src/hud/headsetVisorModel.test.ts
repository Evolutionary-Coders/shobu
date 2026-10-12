import { describe, expect, it } from 'vitest'
import { grappleReadout } from './grappleReadout.ts'
import {
  createVisorState,
  nextVisorChangeMs,
  popKill,
  popKillBanner,
  VISOR_HIT_MS,
  VISOR_KILL_POP_MS,
  VISOR_SIZE,
  type VisorConfig,
  type VisorOp,
  type VisorState,
  visorOps,
} from './headsetVisorModel.ts'
import { KILL_BANNER_MS, type KillCard } from './killCards.ts'
import { VISOR_PALETTE } from './visorPalette.ts'

const CONFIG: VisorConfig = { magazineRounds: 5, grappleCooldownS: 4 }

const DEATH: KillCard = {
  name: 'NEON KITSUNE',
  portraitUrl: '/kitsune.webp',
  weapon: 'sniper',
  tags: ['headshot'],
  distance: '87 M',
}

function state(overrides: Partial<VisorState> = {}): VisorState {
  return { ...createVisorState(CONFIG, 300), ...overrides }
}

function texts(ops: readonly VisorOp[]): string[] {
  return ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []))
}

function textOf(ops: readonly VisorOp[], value: string): Extract<VisorOp, { kind: 'text' }> {
  const found = ops.find((op) => op.kind === 'text' && op.text === value)
  if (found?.kind !== 'text') throw new Error(`sem texto ${JSON.stringify(value)} nas operações`)
  return found
}

describe('createVisorState', () => {
  it('começa com o pente cheio, o gancho pronto e nada piscando', () => {
    const fresh = createVisorState(CONFIG, 300)
    expect([fresh.ammo, fresh.grapple.state, fresh.killPop, fresh.scoped]).toEqual([
      5,
      'ready',
      null,
      false,
    ])
  })
})

describe('visorOps', () => {
  it('desenha relógio, pontos, placar, munição e gancho', () => {
    const shown = texts(visorOps(state({ kills: 3, streak: 2 }), 0, CONFIG))
    expect(shown).toEqual(
      expect.arrayContaining(['05:00', 'PTS: 0000000', '3', '2', '5', '/5', 'PRONTO']),
    )
  })

  it('os kanji do visor do desktop: tempo, abate, sequência, munição e gancho', () => {
    const chips = visorOps(state(), 0, CONFIG).flatMap((op) =>
      op.kind === 'chip' ? [op.text] : [],
    )
    expect(chips).toEqual(['時', '殺', '連', '弾', '鉤'])
  })

  it('o relógio muda de tom no último minuto e nos últimos dez segundos', () => {
    expect(textOf(visorOps(state({ secondsLeft: 120 }), 0, CONFIG), '02:00').color).toBe(
      VISOR_PALETTE.white,
    )
    expect(textOf(visorOps(state({ secondsLeft: 45 }), 0, CONFIG), '00:45').color).toBe(
      VISOR_PALETTE.orange,
    )
    expect(textOf(visorOps(state({ secondsLeft: 5 }), 0, CONFIG), '00:05').color).toBe(
      VISOR_PALETTE.red,
    )
  })

  it('no treino, o relógio diz TREINO e não fica vermelho', () => {
    const op = textOf(visorOps(state({ mode: 'training', secondsLeft: 3 }), 0, CONFIG), 'TREINO')
    expect(op.color).toBe(VISOR_PALETTE.white)
  })

  it('pente vazio fica vermelho, e a barra acompanha', () => {
    const ops = visorOps(state({ ammo: 0, kills: 3, streak: 2 }), 0, CONFIG)
    expect(textOf(ops, '0').color).toBe(VISOR_PALETTE.red)
    const ammoBar = ops.find((op) => op.kind === 'bar' && op.color === VISOR_PALETTE.red)
    expect(ammoBar).toMatchObject({ fraction: 0 })
  })

  it('gancho recarregando fica cinza, com a carga na barra', () => {
    const ops = visorOps(state({ grapple: grappleReadout(2, 4) }), 0, CONFIG)
    expect(textOf(ops, '2,0').color).toBe(VISOR_PALETTE.grey)
    expect(ops).toContainEqual(expect.objectContaining({ kind: 'bar', fraction: 0.5 }))
  })

  it('gancho pronto é branco, e amarelo com superfície ao alcance', () => {
    expect(textOf(visorOps(state(), 0, CONFIG), 'PRONTO').color).toBe(VISOR_PALETTE.white)
    const inReach = visorOps(state({ grappleReach: true }), 0, CONFIG)
    expect(textOf(inReach, 'PRONTO').color).toBe(VISOR_PALETTE.yellow)
  })

  it('em recarga, o alcance não acende nada', () => {
    const cooling = state({ grapple: grappleReadout(2, 4), grappleReach: true })
    expect(textOf(visorOps(cooling, 0, CONFIG), '2,0').color).toBe(VISOR_PALETTE.grey)
  })

  it('fora da área: aviso laranja, e vermelho nos dois últimos segundos', () => {
    const warning = visorOps(state({ boundaryTenths: 42 }), 0, CONFIG)
    expect(textOf(warning, '4,2').color).toBe(VISOR_PALETTE.orange)
    const critical = visorOps(state({ boundaryTenths: 15 }), 0, CONFIG)
    expect(textOf(critical, '1,5').color).toBe(VISOR_PALETTE.red)
  })

  it('dentro da área, nenhum aviso', () => {
    expect(texts(visorOps(state(), 0, CONFIG))).not.toContain('VOLTE PARA A ARENA')
  })

  it('o hitmarker aparece só até expirar', () => {
    const hit = state({ hitUntilMs: VISOR_HIT_MS })
    expect(visorOps(hit, 0, CONFIG)).toContainEqual(expect.objectContaining({ kind: 'hitmarker' }))
    expect(visorOps(hit, VISOR_HIT_MS, CONFIG)).not.toContainEqual(
      expect.objectContaining({ kind: 'hitmarker' }),
    )
  })

  it('a luneta desenha a máscara primeiro, para os números ficarem por cima', () => {
    const ops = visorOps(state({ scoped: true }), 0, CONFIG)
    expect(ops[0]).toEqual({ kind: 'scope', radius: VISOR_SIZE.height * 0.44 })
  })

  it('sem luneta, sem máscara', () => {
    expect(visorOps(state(), 0, CONFIG)).not.toContainEqual(
      expect.objectContaining({ kind: 'scope' }),
    )
  })

  it('barras nunca passam de cheia nem de vazia', () => {
    const ops = visorOps(state({ ammo: 9 }), 0, CONFIG)
    const fractions = ops.flatMap((op) => (op.kind === 'bar' ? [op.fraction] : []))
    expect(fractions.every((fraction) => fraction >= 0 && fraction <= 1)).toBe(true)
  })
})

describe('popKill', () => {
  it('mostra os pontos e as medalhas até expirar', () => {
    const popped = state()
    popKill(popped, 150, ['DUPLA', 'DE LONGE'], 1_000)
    expect(texts(visorOps(popped, 1_000, CONFIG))).toEqual(
      expect.arrayContaining(['+150', 'DUPLA', 'DE LONGE']),
    )
    expect(texts(visorOps(popped, 1_000 + VISOR_KILL_POP_MS, CONFIG))).not.toContain('+150')
  })
})

describe('nextVisorChangeMs', () => {
  it('sem nada piscando, o visor só muda por evento', () => {
    expect(nextVisorChangeMs(state(), 0)).toBe(Number.POSITIVE_INFINITY)
  })

  it('o cartão de abate também expira sozinho, e some depois', () => {
    const busy = state()
    popKillBanner(busy, DEATH, 100)
    expect(nextVisorChangeMs(busy, 100)).toBe(100 + KILL_BANNER_MS)
    expect(texts(visorOps(busy, 100, CONFIG))).toContain('ABATIDO')
    expect(texts(visorOps(busy, 100 + KILL_BANNER_MS, CONFIG))).not.toContain('ABATIDO')
  })

  it('é a expiração mais próxima que ainda não passou', () => {
    const busy = state({ hitUntilMs: 300 })
    popKill(busy, 100, [], 0)
    expect(nextVisorChangeMs(busy, 0)).toBe(300)
    expect(nextVisorChangeMs(busy, 300)).toBe(VISOR_KILL_POP_MS)
  })
})

describe('o placar e quem matou, no óculos', () => {
  const ROWS = [
    { rank: 1, name: 'ONRYO', points: 300, kills: 3, deaths: 0, local: false },
    { rank: 2, name: 'VOCÊ', points: 100, kills: 1, deaths: 2, local: true },
  ]

  it('o placar fechado não desenha nada, mesmo com linhas', () => {
    const ops = visorOps(state({ scoreboard: ROWS }), 0, CONFIG)
    expect(ops.some((op) => op.kind === 'plate')).toBe(false)
    expect(texts(ops)).not.toContain('ONRYO')
  })

  it('aberto, desenha a placa por baixo e uma linha por jogador, o jogador em amarelo', () => {
    const ops = visorOps(state({ scoreboard: ROWS, scoreboardOpen: true }), 0, CONFIG)
    const plate = ops.findIndex((op) => op.kind === 'plate')
    expect(plate).toBeGreaterThanOrEqual(0)
    expect(ops.findIndex((op) => op.kind === 'text' && op.text === 'ONRYO')).toBeGreaterThan(plate)
    expect(textOf(ops, 'VOCÊ').color).toBe(VISOR_PALETTE.yellow)
    expect(textOf(ops, 'ONRYO').color).toBe(VISOR_PALETTE.white)
    expect(texts(ops)).toEqual(expect.arrayContaining(['PLACAR', '300', '1/2']))
  })

  it('morto, diz quem matou; vivo, nada', () => {
    const death = { ...DEATH, name: 'ONRYO' }
    expect(texts(visorOps(state({ death }), 0, CONFIG))).toEqual(
      expect.arrayContaining(['ELIMINADO POR', 'ONRYO', '87 M']),
    )
    expect(texts(visorOps(state(), 0, CONFIG))).not.toContain('ELIMINADO POR')
  })
})
