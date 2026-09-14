import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import gameplay from '../../../../config/gameplay.json' with { type: 'json' }
import { boltCue, nowCue, reloadCue } from './soundTiming.ts'

const WEAPON = parseGameplayConfig(gameplay).weapon

/** Medidos no envelope do wav de origem, a cada 20 ms. */
const BOLT_LASTS_S = 0.7
const INSERT_AT_S = 1.02

describe('nowCue', () => {
  it('soa na hora e desde o começo do arquivo', () => {
    expect(nowCue('scope')).toEqual({ name: 'scope', delayS: 0, offsetS: 0 })
  })
})

describe('boltCue', () => {
  it('recorta o pedaço do ferrolho, e não toca o tiro de novo', () => {
    expect(boltCue(WEAPON).offsetS).toBe(0.9)
    expect(boltCue(WEAPON).name).toBe('shot-reload')
  })

  /** Era este o defeito: o último clique caía depois de o ferrolho fechar. */
  it('os cliques cabem inteiros na janela do ferrolho', () => {
    const cue = boltCue(WEAPON)
    expect(cue.delayS + BOLT_LASTS_S).toBeLessThanOrEqual(WEAPON.boltCycleS)
  })

  it('fica centrado: sobra o mesmo tanto antes e depois', () => {
    const cue = boltCue(WEAPON)
    const depois = WEAPON.boltCycleS - cue.delayS - BOLT_LASTS_S
    expect(cue.delayS).toBeCloseTo(depois, 6)
  })

  it('segue o ferrolho da configuração, e não um número solto', () => {
    const rapido = boltCue({ ...WEAPON, boltCycleS: 0.9 })
    const lento = boltCue({ ...WEAPON, boltCycleS: 2.4 })
    expect(rapido.delayS).toBeLessThan(lento.delayS)
  })

  it('ferrolho mais curto que o take não empurra o clique para antes do tiro', () => {
    expect(boltCue({ ...WEAPON, boltCycleS: 0.2 }).delayS).toBe(0)
  })
})

describe('reloadCue', () => {
  /** Era este o defeito: o carregador entrava enquanto ainda estava saindo. */
  it('espera para a inserção cair nos sete décimos da recarga', () => {
    const cue = reloadCue(WEAPON)
    expect(cue.delayS + INSERT_AT_S).toBeCloseTo(WEAPON.reloadS * 0.7, 6)
  })

  it('toca o arquivo desde o começo: o que atrasa é a entrada, não o corte', () => {
    expect(reloadCue(WEAPON).offsetS).toBe(0)
  })

  it('a inserção cai dentro da recarga, nunca depois dela', () => {
    for (const reloadS of [1.5, 2.4, 4]) {
      const cue = reloadCue({ ...WEAPON, reloadS })
      expect(cue.delayS + INSERT_AT_S).toBeLessThan(reloadS)
    }
  })

  it('recarga curta demais para o take não atrasa nada', () => {
    expect(reloadCue({ ...WEAPON, reloadS: 1 }).delayS).toBe(0)
  })
})
