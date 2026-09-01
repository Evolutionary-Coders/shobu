import { readFileSync } from 'node:fs'
import { type GameplayConfig, parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { TIME_TO_CONTROL_BUDGET_MS } from '../instrumentation/timeToPlayerControl.ts'
import {
  type BootLine,
  buildBootSequence,
  INTRO_IDLE_BEAT_MS,
  INTRO_LOGO_REVEAL_MS,
  introDurationMs,
} from './bootSequence.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)

function shippedConfig(): GameplayConfig {
  return parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
}

const textOf = (lines: readonly BootLine[]): string => lines.map((line) => line.text).join('\n')

describe('buildBootSequence', () => {
  it('mostra os números que o jogo vai usar, não números decorativos', () => {
    const config = shippedConfig()
    const text = textOf(buildBootSequence(config))
    expect(text).toContain(`TICK ${config.simulation.tickHz}Hz`)
    expect(text).toContain(`FOV ${config.camera.baseFovDeg}°`)
    expect(text).toContain(`HITSCAN ${config.weapon.hitscanRangeM}m`)
  })

  it('acompanha a config em vez de repetir número fixo', () => {
    const config = shippedConfig()
    const louder = { ...config, camera: { ...config.camera, baseFovDeg: 120 } }
    expect(textOf(buildBootSequence(louder))).toContain('FOV 120°')
  })

  it('anuncia as duas regras que são pilar, não ajuste de balanceamento', () => {
    const text = textOf(buildBootSequence(shippedConfig()))
    expect(text).toContain('UM TIRO MATA')
    expect(text).toContain('NENHUMA')
  })

  it('enche os três cantos, senão a tela fica com um bloco só', () => {
    const channels = new Set(buildBootSequence(shippedConfig()).map((line) => line.channel))
    expect(channels).toEqual(new Set(['telemetry', 'main', 'uplink']))
  })

  it('só usa tons declarados', () => {
    const tones = new Set(buildBootSequence(shippedConfig()).map((line) => line.tone))
    expect([...tones].every((t) => ['system', 'ok', 'warn', 'accent'].includes(t))).toBe(true)
  })
})

describe('introDurationMs', () => {
  it('soma as pausas mais a piscada inicial e a entrada do logo', () => {
    const lines: BootLine[] = [
      { channel: 'main', text: 'a', tone: 'ok', delayMs: 100 },
      { channel: 'main', text: 'b', tone: 'ok', delayMs: 250 },
    ]
    expect(introDurationMs(lines)).toBe(350 + INTRO_IDLE_BEAT_MS + INTRO_LOGO_REVEAL_MS)
  })

  /**
   * A trava que impede a intro de comer o jogo: se alguém acrescentar vinte
   * linhas, este teste quebra antes de o pilar 2 quebrar na feira.
   */
  it('cabe no orçamento de cinco segundos mesmo se ninguém pular', () => {
    const duration = introDurationMs(buildBootSequence(shippedConfig()))
    expect(duration).toBeLessThan(TIME_TO_CONTROL_BUDGET_MS)
  })

  it('deixa folga para o carregamento, não só para a animação', () => {
    expect(introDurationMs(buildBootSequence(shippedConfig()))).toBeLessThan(3_500)
  })
})
