import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import gameplay from '../../../../config/gameplay.json' with { type: 'json' }
import { type AudioWorldSample, createSoundCues, type SoundCues } from './arenaSoundCues.ts'

const WEAPON = parseGameplayConfig(gameplay).weapon

const RESTING: AudioWorldSample = {
  shotsFired: 0,
  roundsInMagazine: 5,
  reloading: false,
  scoped: false,
  grounded: true,
}

/** Assenta o quadro anterior antes de medir a borda que interessa. */
function cuesAfter(first: Partial<AudioWorldSample>, second: Partial<AudioWorldSample>) {
  const cues: SoundCues = createSoundCues(WEAPON)
  cues.since({ ...RESTING, ...first })
  return [...cues.since({ ...RESTING, ...first, ...second })]
}

function namesAfter(first: Partial<AudioWorldSample>, second: Partial<AudioWorldSample>) {
  return cuesAfter(first, second).map((cue) => cue.name)
}

describe('createSoundCues', () => {
  it('o quadro parado não dispara nada', () => {
    expect(namesAfter({}, {})).toEqual([])
  })

  it('o contador de tiros subindo é o disparo, no take seco', () => {
    expect(namesAfter({}, { shotsFired: 1 })).toContain('shot-sniper')
  })

  it('o mesmo contador em dois quadros não toca o tiro de novo', () => {
    const cues = createSoundCues(WEAPON)
    cues.since({ ...RESTING, shotsFired: 1 })
    expect([...cues.since({ ...RESTING, shotsFired: 1 })]).toEqual([])
  })

  it('a recarga toca na borda, e não enquanto dura', () => {
    expect(namesAfter({}, { reloading: true })).toContain('reload')
    expect(namesAfter({ reloading: true }, { reloading: true })).toEqual([])
  })

  it('a luneta toca ao abrir, e não ao fechar', () => {
    expect(namesAfter({}, { scoped: true })).toContain('scope')
    expect(namesAfter({ scoped: true }, { scoped: false })).toEqual([])
  })

  it('a aterrissagem toca ao tocar o chão, e não ao sair dele', () => {
    expect(namesAfter({ grounded: false }, { grounded: true })).toContain('landing-after-jump')
    expect(namesAfter({}, { grounded: false })).toEqual([])
  })

  it('o primeiro quadro no chão não soa como aterrissagem', () => {
    expect([...createSoundCues(WEAPON).since(RESTING)]).toEqual([])
  })

  it('dois eventos no mesmo quadro saem os dois', () => {
    expect(namesAfter({}, { shotsFired: 1, scoped: true })).toEqual([
      'shot-sniper',
      'shot-reload',
      'scope',
    ])
  })

  it('reaproveita o vetor, e o quadro seguinte não herda o som do anterior', () => {
    const cues = createSoundCues(WEAPON)
    const primeiro = cues.since({ ...RESTING, scoped: true })
    expect(primeiro).toHaveLength(1)
    cues.since({ ...RESTING, scoped: true })
    expect(primeiro).toHaveLength(0)
  })
})

describe('o ferrolho', () => {
  it('sai como disparo próprio, recortado do take que o traz junto com o tiro', () => {
    const bolt = cuesAfter({}, { shotsFired: 1 }).find((cue) => cue.name === 'shot-reload')
    expect(bolt?.offsetS).toBeGreaterThan(0)
  })

  it('cabe inteiro na janela do ferrolho, senão o clique sai depois de fechado', () => {
    const bolt = cuesAfter({}, { shotsFired: 1 }).find((cue) => cue.name === 'shot-reload')
    expect(bolt?.delayS).toBeGreaterThan(0)
    expect((bolt?.delayS ?? 0) + 0.7).toBeLessThanOrEqual(WEAPON.boltCycleS)
  })

  it('o tiro que esvazia o pente não cicla ferrolho: o que vem é a recarga', () => {
    expect(namesAfter({}, { shotsFired: 1, roundsInMagazine: 0 })).toEqual(['shot-sniper'])
  })
})

describe('a recarga', () => {
  it('espera antes de soar, senão o carregador entra enquanto ainda está saindo', () => {
    const reload = cuesAfter({}, { reloading: true })[0]
    expect(reload?.delayS).toBeGreaterThan(0.5)
  })

  it('a inserção cai dentro da recarga, e não depois dela', () => {
    const reload = cuesAfter({}, { reloading: true })[0]
    expect((reload?.delayS ?? 0) + 1.02).toBeLessThan(WEAPON.reloadS)
  })
})
