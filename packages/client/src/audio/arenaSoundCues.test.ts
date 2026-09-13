import { describe, expect, it } from 'vitest'
import { type AudioWorldSample, createSoundCues, type SoundCues } from './arenaSoundCues.ts'

const RESTING: AudioWorldSample = {
  shotsFired: 0,
  roundsInMagazine: 5,
  reloading: false,
  scoped: false,
  grounded: true,
}

/** Assenta o quadro anterior antes de medir a borda que interessa. */
function cuesAfter(first: Partial<AudioWorldSample>, second: Partial<AudioWorldSample>) {
  const cues: SoundCues = createSoundCues()
  cues.since({ ...RESTING, ...first })
  return [...cues.since({ ...RESTING, ...first, ...second })]
}

describe('createSoundCues', () => {
  it('o quadro parado não dispara nada', () => {
    expect(cuesAfter({}, {})).toEqual([])
  })

  it('o contador de tiros subindo é o disparo', () => {
    expect(cuesAfter({}, { shotsFired: 1 })).toContain('shot-reload')
  })

  it('o tiro que esvazia o pente é o take seco, sem o ferrolho', () => {
    expect(cuesAfter({}, { shotsFired: 1, roundsInMagazine: 0 })).toContain('shot-sniper')
  })

  it('o mesmo contador em dois quadros não toca o tiro de novo', () => {
    const cues = createSoundCues()
    cues.since({ ...RESTING, shotsFired: 1 })
    expect([...cues.since({ ...RESTING, shotsFired: 1 })]).toEqual([])
  })

  it('a recarga toca na borda, e não enquanto dura', () => {
    expect(cuesAfter({}, { reloading: true })).toContain('reload')
    expect(cuesAfter({ reloading: true }, { reloading: true })).toEqual([])
  })

  it('a luneta toca ao abrir, e não ao fechar', () => {
    expect(cuesAfter({}, { scoped: true })).toContain('scope')
    expect(cuesAfter({ scoped: true }, { scoped: false })).toEqual([])
  })

  it('a aterrissagem toca ao tocar o chão, e não ao sair dele', () => {
    expect(cuesAfter({ grounded: false }, { grounded: true })).toContain('landing-after-jump')
    expect(cuesAfter({}, { grounded: false })).toEqual([])
  })

  it('o primeiro quadro no chão não soa como aterrissagem', () => {
    expect([...createSoundCues().since(RESTING)]).toEqual([])
  })

  it('dois eventos no mesmo quadro saem os dois', () => {
    expect(cuesAfter({}, { shotsFired: 1, scoped: true })).toEqual(['shot-reload', 'scope'])
  })

  it('reaproveita o vetor, e o quadro seguinte não herda o som do anterior', () => {
    const cues = createSoundCues()
    const primeiro = cues.since({ ...RESTING, scoped: true })
    expect(primeiro).toHaveLength(1)
    cues.since({ ...RESTING, scoped: true })
    expect(primeiro).toHaveLength(0)
  })
})
