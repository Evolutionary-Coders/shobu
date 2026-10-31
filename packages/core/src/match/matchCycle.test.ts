import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { MatchConfig } from '../config/gameplayConfig.ts'
import { parseGameplayConfig } from '../config/parseGameplayConfig.ts'
import {
  createMatchCycle,
  type MatchCycle,
  type MatchCycleEdge,
  matchPhaseFrozen,
  matchPhaseLeftS,
  matchPhaseLengthS,
  matchPhaseScores,
  restartMatchCycle,
  scoreLimitReached,
  stepMatchCycle,
} from './matchCycle.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

/** Números redondos, para a conta dos testes ser lida de cabeça. */
const match: MatchConfig = {
  ...shipped.match,
  warmupS: 12,
  durationS: 300,
  overHoldS: 3,
  resultsS: 10,
  decidedHoldS: 1.5,
  scoreLimitPoints: 3000,
}

function cycleIn(phase: MatchCycle['phase'], timed = true): MatchCycle {
  return { ...createMatchCycle({ warmup: true, timed }), phase }
}

/** Anda passos de `dtS` até a primeira borda, e devolve a borda. */
function runUntilEdge(cycle: MatchCycle, dtS: number, leader = 0): MatchCycleEdge | undefined {
  for (let step = 0; step < 100_000; step += 1) {
    const edge = stepMatchCycle(cycle, dtS, leader, match)
    if (edge) return edge
  }
  return undefined
}

describe('createMatchCycle', () => {
  it('começa no aquecimento, a partida online', () => {
    expect(createMatchCycle({ warmup: true, timed: true })).toEqual({
      phase: 'warmup',
      phaseS: 0,
      timed: true,
      restartDue: false,
    })
  })

  it('começa já valendo sem aquecimento, o offline', () => {
    expect(createMatchCycle({ warmup: false, timed: false }).phase).toBe('live')
  })
})

describe('stepMatchCycle', () => {
  it('passa pelas fases na ordem, avisando cada borda e depois o next', () => {
    const cycle = createMatchCycle({ warmup: true, timed: true })
    const edges = [1, 2, 3, 4, 5].map(() => runUntilEdge(cycle, 0.5))
    expect(edges).toEqual(['live', 'over', 'results', 'decided', 'next'])
  })

  it('o aquecimento dura warmupS', () => {
    const cycle = createMatchCycle({ warmup: true, timed: true })
    expect(stepMatchCycle(cycle, 11.9, 0, match)).toBeUndefined()
    expect(stepMatchCycle(cycle, 0.1, 0, match)).toBe('live')
    expect(cycle).toMatchObject({ phase: 'live', phaseS: 0 })
  })

  it('uma borda por passo: um passo longo não pula a tela de MVP', () => {
    const cycle = cycleIn('over')
    expect(stepMatchCycle(cycle, 60, 0, match)).toBe('results')
    expect(cycle.phase).toBe('results')
    expect(cycle.phaseS).toBe(0)
  })

  it('acaba a partida no limite de pontos antes do relógio', () => {
    const cycle = cycleIn('live')
    expect(stepMatchCycle(cycle, 1, 2999, match)).toBeUndefined()
    expect(stepMatchCycle(cycle, 1, 3000, match)).toBe('over')
  })

  it('sem relógio, nem o tempo nem o limite acabam a partida', () => {
    const cycle = cycleIn('live', false)
    expect(stepMatchCycle(cycle, 10_000, 99_999, match)).toBeUndefined()
    expect(cycle.phase).toBe('live')
  })

  it('o limite só vale com a partida em andamento: o aquecimento não acaba nele', () => {
    const cycle = cycleIn('warmup')
    expect(stepMatchCycle(cycle, 1, 99_999, match)).toBeUndefined()
  })

  it('avisa o next uma vez só e fica em decided até recomeçar', () => {
    const cycle = cycleIn('decided')
    expect(stepMatchCycle(cycle, 2, 0, match)).toBe('next')
    expect(stepMatchCycle(cycle, 2, 0, match)).toBeUndefined()
    expect(cycle.phase).toBe('decided')
  })

  it('com o hold zero, o next sai no primeiro passo', () => {
    const cycle = cycleIn('decided')
    expect(stepMatchCycle(cycle, 0, 0, { ...match, decidedHoldS: 0 })).toBe('next')
  })
})

describe('matchPhaseLengthS e matchPhaseLeftS', () => {
  it.each([
    ['warmup', 12],
    ['live', 300],
    ['over', 3],
    ['results', 10],
    ['decided', 1.5],
  ] as const)('%s dura o que a config diz', (phase, lengthS) => {
    expect(matchPhaseLengthS(cycleIn(phase), match)).toBe(lengthS)
  })

  it('a partida sem relógio não tem fim', () => {
    expect(matchPhaseLeftS(cycleIn('live', false), match)).toBe(Number.POSITIVE_INFINITY)
  })

  it('conta o que falta na fase, e nunca abaixo de zero', () => {
    const cycle = cycleIn('live')
    cycle.phaseS = 12.5
    expect(matchPhaseLeftS(cycle, match)).toBe(287.5)
    cycle.phaseS = 400
    expect(matchPhaseLeftS(cycle, match)).toBe(0)
  })
})

describe('matchPhaseScores e matchPhaseFrozen', () => {
  it.each([
    ['warmup', false, false],
    ['live', true, false],
    ['over', false, true],
    ['results', false, true],
    ['decided', false, true],
  ] as const)('%s: pontua %s, congela %s', (phase, scores, frozen) => {
    expect(matchPhaseScores(cycleIn(phase))).toBe(scores)
    expect(matchPhaseFrozen(cycleIn(phase))).toBe(frozen)
  })
})

describe('scoreLimitReached', () => {
  it('limite zero é partida só de relógio', () => {
    expect(scoreLimitReached(1_000_000, { ...match, scoreLimitPoints: 0 })).toBe(false)
  })

  it('chega no limite exato', () => {
    expect(scoreLimitReached(3000, match)).toBe(true)
    expect(scoreLimitReached(2900, match)).toBe(false)
  })
})

describe('restartMatchCycle', () => {
  it('volta ao aquecimento e volta a avisar bordas', () => {
    const cycle = cycleIn('decided')
    stepMatchCycle(cycle, 2, 0, match)
    restartMatchCycle(cycle, true)
    expect(cycle).toMatchObject({ phase: 'warmup', phaseS: 0, restartDue: false })
    expect(runUntilEdge(cycle, 1)).toBe('live')
  })

  it('sem aquecimento volta valendo, e guarda o relógio da partida', () => {
    const cycle = cycleIn('decided', false)
    restartMatchCycle(cycle, false)
    expect(cycle).toMatchObject({ phase: 'live', timed: false })
  })
})
