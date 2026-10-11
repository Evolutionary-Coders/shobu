import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { boltCycleMs, reloadMs, scopeOpenMs } from './scopeTiming.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

/**
 * O orçamento do que o jogador lê como informação. Animação que dura diferente
 * do número do jogo é tela mentindo.
 */
describe('as durações que o css tem que respeitar', () => {
  it('a luneta abre no tempo que o gameplay.json manda', () => {
    expect(scopeOpenMs(config)).toBe(Math.round(config.camera.scopeTransitionS * 1000))
  })

  it('o ferrolho e a recarga saem do mesmo lugar', () => {
    expect(boltCycleMs(config)).toBe(1300)
    expect(reloadMs(config)).toBe(2400)
  })

  /** Luneta mais lenta que o ferrolho faria a arma parecer quebrada. */
  it('a luneta não demora mais que um ciclo de ferrolho', () => {
    expect(scopeOpenMs(config)).toBeLessThan(boltCycleMs(config))
  })

  it('a recarga custa mais que o ferrolho, como a arma manda', () => {
    expect(reloadMs(config)).toBeGreaterThan(boltCycleMs(config))
  })
})
