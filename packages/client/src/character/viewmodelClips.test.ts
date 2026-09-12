import { describe, expect, it } from 'vitest'
import {
  ALLANIMS_FRAMES,
  clipDurationS,
  IDLE_FRAME,
  REST_FRAMES,
  speedRatioFor,
  VIEWMODEL_SEGMENTS,
  type ViewmodelClip,
} from './viewmodelClips.ts'

const CLIPS = Object.keys(VIEWMODEL_SEGMENTS) as readonly ViewmodelClip[]

describe('VIEWMODEL_SEGMENTS', () => {
  it('todo intervalo cabe dentro do clipe allanims', () => {
    for (const clip of CLIPS) {
      const { fromFrame, toFrame } = VIEWMODEL_SEGMENTS[clip]
      expect(fromFrame).toBeGreaterThanOrEqual(0)
      expect(toFrame).toBeLessThanOrEqual(ALLANIMS_FRAMES)
      expect(toFrame).toBeGreaterThan(fromFrame)
    }
  })

  /**
   * A invariante que impede o solavanco. Cortar fora de um platô de descanso
   * faz o `stop()`/`start()` saltar entre duas poses diferentes, e é
   * exatamente o defeito que este módulo existe para não ter.
   */
  it('todo limite de segmento cai numa pose de descanso', () => {
    for (const clip of CLIPS) {
      const { fromFrame, toFrame } = VIEWMODEL_SEGMENTS[clip]
      expect(REST_FRAMES).toContain(fromFrame)
      expect(REST_FRAMES).toContain(toFrame)
    }
  })

  it('a pose parada também é de descanso', () => {
    expect(REST_FRAMES).toContain(IDLE_FRAME)
  })

  it('os intervalos não se sobrepõem', () => {
    const ordered = CLIPS.map((clip) => VIEWMODEL_SEGMENTS[clip]).sort(
      (a, b) => a.fromFrame - b.fromFrame,
    )
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]?.fromFrame).toBeGreaterThanOrEqual(ordered[i - 1]?.toFrame ?? 0)
    }
  })

  /** O disparo tem que ser curto: é o único clipe que o jogador vê em cada tiro. */
  it('o disparo é o mais curto e a recarga é a mais longa', () => {
    expect(clipDurationS('shoot')).toBeLessThan(clipDurationS('bolt'))
    expect(clipDurationS('reload')).toBeGreaterThan(clipDurationS('bolt'))
  })
})

describe('speedRatioFor', () => {
  it('acelera o clipe para caber no ciclo de ferrolho da configuração', () => {
    expect(speedRatioFor('bolt', 1.3)).toBeCloseTo(1.23, 2)
  })

  it('desacelera o clipe quando o jogo dá mais tempo que o asset', () => {
    expect(speedRatioFor('reload', 2.4)).toBeCloseTo(0.76, 2)
  })

  it('devolve 1 quando o jogo pede exatamente a duração autorada', () => {
    expect(speedRatioFor('shoot', clipDurationS('shoot'))).toBe(1)
  })

  it('recusa duração que não avança, dizendo o que recebeu', () => {
    expect(() => speedRatioFor('bolt', 0)).toThrow(/targetDurationS recebeu 0/)
    expect(() => speedRatioFor('bolt', Number.NaN)).toThrow(/targetDurationS recebeu NaN/)
  })
})
