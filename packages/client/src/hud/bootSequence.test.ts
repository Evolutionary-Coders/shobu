import { describe, expect, it } from 'vitest'
import { TIME_TO_CONTROL_BUDGET_MS } from '../instrumentation/timeToPlayerControl.ts'
import {
  type BootLine,
  buildBootSequence,
  INTRO_IDLE_BEAT_MS,
  INTRO_LOGO_REVEAL_MS,
  introDurationMs,
} from './bootSequence.ts'

const textOf = (lines: readonly BootLine[]): string => lines.map((line) => line.text).join('\n')

describe('buildBootSequence', () => {
  /**
   * O roteiro deixou de espelhar `config/gameplay.json` — a exigência caiu e a
   * cópia virou texto autoral. Os dois testes que travavam o espelhamento
   * saíram daqui junto com ela; este guarda o que sobrou do argumento: a tela
   * não inventa número de gameplay, ela simplesmente não fala de número.
   */
  it('não anuncia número de gameplay que possa ficar defasado', () => {
    const text = textOf(buildBootSequence())
    expect(text).not.toMatch(/\d+\s*(Hz|m\/s|ms)\b/i)
  })

  /**
   * Os pilares saíram daqui para a tira do logo (`buildPillarStrip`), que
   * chega inteira com o slam. Se voltarem para a fila de impressão, voltam a
   * roubar o clímax e a custar meio segundo do pilar 2.
   */
  it('não datilografa os pilares junto com a saída de máquina', () => {
    const text = textOf(buildBootSequence())
    expect(text).not.toContain('UM TIRO MATA')
  })

  it('enche as três regiões, senão a tela fica com um bloco só', () => {
    const channels = new Set(buildBootSequence().map((line) => line.channel))
    expect(channels).toEqual(new Set(['telemetry', 'brief', 'uplink']))
  })

  it('só usa tons declarados', () => {
    const tones = new Set(buildBootSequence().map((line) => line.tone))
    expect([...tones].every((t) => ['system', 'ok', 'dim', 'accent'].includes(t))).toBe(true)
  })

  /**
   * O rodapé mostrava porta do vite e do colyseus numa tela de jogador. Nada
   * que só faça sentido para quem roda `npm run dev` volta para cá.
   */
  it('não vaza detalhe de ambiente de desenvolvimento', () => {
    const text = textOf(buildBootSequence())
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
    const duration = introDurationMs(buildBootSequence())
    expect(duration).toBeLessThan(TIME_TO_CONTROL_BUDGET_MS)
  })

  it('deixa folga para o carregamento, não só para a animação', () => {
    expect(introDurationMs(buildBootSequence())).toBeLessThan(2_200)
  })
})
