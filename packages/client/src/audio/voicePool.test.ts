import { describe, expect, it } from 'vitest'
import { busyUntil, pickVoice, type VoiceSlot } from './voicePool.ts'

function slots(...pairs: [busyUntilS: number, startedAtS: number][]): VoiceSlot[] {
  return pairs.map(([busyUntilS, startedAtS]) => ({ busyUntilS, startedAtS }))
}

describe('pickVoice', () => {
  it('pega a primeira voz livre', () => {
    expect(pickVoice(slots([5, 1], [2, 1], [1, 0]), 3)).toBe(1)
  })

  it('a voz que termina agora já está livre', () => {
    expect(pickVoice(slots([3, 1]), 3)).toBe(0)
  })

  /** Sem livre, rouba a mais velha: o tiro de agora vale mais que o fim do ferrolho. */
  it('todas ocupadas, rouba a que começou há mais tempo', () => {
    expect(pickVoice(slots([9, 4], [9, 2], [9, 3]), 5)).toBe(1)
  })

  it('recusa pool vazio', () => {
    expect(() => pickVoice([], 0)).toThrow(/slots \[\]/)
  })
})

describe('busyUntil', () => {
  it('soma o atraso e o trecho que sobra do arquivo, na velocidade pedida', () => {
    expect(busyUntil(10, 0.5, 2, 1, 2)).toBeCloseTo(11)
  })

  it('começar depois do fim do arquivo não ocupa nada além do atraso', () => {
    expect(busyUntil(10, 0.5, 1, 3, 1)).toBeCloseTo(10.5)
  })
})
