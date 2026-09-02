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

  /**
   * Os pilares saíram daqui para a tira do logo (`buildPillarStrip`), que
   * chega inteira com o slam. Se voltarem para a fila de impressão, voltam a
   * roubar o clímax e a custar meio segundo do pilar 2.
   */
  it('não datilografa os pilares junto com a saída de máquina', () => {
    const text = textOf(buildBootSequence(shippedConfig()))
    expect(text).not.toContain('UM TIRO MATA')
  })

  it('enche as três regiões, senão a tela fica com um bloco só', () => {
    const channels = new Set(buildBootSequence(shippedConfig()).map((line) => line.channel))
    expect(channels).toEqual(new Set(['telemetry', 'brief', 'uplink']))
  })

  it('só usa tons declarados', () => {
    const tones = new Set(buildBootSequence(shippedConfig()).map((line) => line.tone))
    expect([...tones].every((t) => ['system', 'ok', 'dim', 'accent'].includes(t))).toBe(true)
  })

  /**
   * O rodapé mostrava porta do vite e do colyseus numa tela de jogador. Nada
   * que só faça sentido para quem roda `npm run dev` volta para cá.
   */
  it('não vaza detalhe de ambiente de desenvolvimento', () => {
    const text = textOf(buildBootSequence(shippedConfig()))
    expect(text).not.toMatch(/VITE|COLYSEUS|5173|2567|localhost/i)
  })
})

describe('introDurationMs', () => {
  it('soma as pausas mais a piscada inicial e a entrada do logo', () => {
    const lines: BootLine[] = [
      { channel: 'telemetry', text: 'a', tone: 'ok', delayMs: 100 },
      { channel: 'telemetry', text: 'b', tone: 'ok', delayMs: 250 },
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
    expect(introDurationMs(buildBootSequence(shippedConfig()))).toBeLessThan(2_200)
  })
})
