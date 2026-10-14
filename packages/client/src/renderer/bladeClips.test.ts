import { MELEE_WEAPONS } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import gameplay from '../../../../config/gameplay.json' with { type: 'json' }
import {
  BLADE_CLIPS,
  type BladeClipSpec,
  bladeClipSpec,
  bladeGroupName,
  clipDurationMismatches,
  sampleScalar,
  trailStrength,
} from './bladeClips.ts'

const meleeConfig = gameplay.melee

describe('BLADE_CLIPS', () => {
  it('cada golpe cabe na recarga dele: o próximo parte da guarda (gameplay.json)', () => {
    expect(bladeClipSpec('katana', 'slash_1').durationS).toBeLessThanOrEqual(
      meleeConfig.katanaSlashCooldownS,
    )
    expect(bladeClipSpec('katana', 'quick').durationS).toBeLessThanOrEqual(
      meleeConfig.katanaQuickCooldownS,
    )
    for (const clip of ['stab', 'slash', 'quick'] as const) {
      expect(bladeClipSpec('knife', clip).durationS).toBeLessThanOrEqual(meleeConfig.knifeCooldownS)
    }
  })

  it('o saque dura o que o núcleo leva para liberar o golpe', () => {
    expect(bladeClipSpec('katana', 'draw').durationS).toBe(meleeConfig.katanaDrawS)
    expect(bladeClipSpec('knife', 'draw').durationS).toBe(meleeConfig.knifeDrawS)
  })

  it.each(MELEE_WEAPONS)('a %s tem descanso em laço e o resto toca uma vez', (weapon) => {
    for (const [clip, spec] of Object.entries(BLADE_CLIPS[weapon])) {
      expect((spec as BladeClipSpec).loop).toBe(clip === 'idle')
    }
  })

  it('o rastro acende na fase rápida do corte, onde ele cruza a retícula', () => {
    const slash = bladeClipSpec('katana', 'slash_1')
    expect(trailStrength(slash, 0.12)).toBe(1)
    expect(trailStrength(slash, 0.01)).toBe(0)
    expect(trailStrength(slash, 0.3)).toBe(0)
    expect(trailStrength(slash, 0.08)).toBeGreaterThan(0)
    expect(trailStrength(slash, 0.08)).toBeLessThan(1)
    expect(trailStrength(bladeClipSpec('katana', 'idle'), 1)).toBe(0)
  })

  it('a faca não tem investida: pedir é erro, com o que ela tem', () => {
    expect(() => bladeClipSpec('knife', 'dash')).toThrow(/knife.*dash.*idle/)
  })

  it('o nome do grupo no glb', () => {
    expect(bladeGroupName('knife', 'stab')).toBe('knife_stab')
  })

  it('o nome pedido de novo é o mesmo, sem montar outro (o quadro não aloca)', () => {
    expect(bladeGroupName('katana', 'dash')).toBe('katana_dash')
    expect(bladeGroupName('katana', 'dash')).toBe('katana_dash')
    expect(bladeGroupName('katana', 'quick')).toBe('katana_quick')
  })
})

describe('clipDurationMismatches', () => {
  const allOf = (weapon: 'katana' | 'knife'): Map<string, number> =>
    new Map(
      Object.entries(BLADE_CLIPS[weapon]).map(([clip, spec]) => [
        `${weapon}_${clip}`,
        (spec as BladeClipSpec).durationS,
      ]),
    )

  it('o glb e a tabela de acordo: nada a dizer', () => {
    expect(clipDurationMismatches('katana', allOf('katana'))).toEqual([])
  })

  it('o arredondamento a quadro inteiro do bake passa', () => {
    const durations = allOf('katana')
    durations.set('katana_holster', 13 / 60)
    expect(clipDurationMismatches('katana', durations)).toEqual([])
  })

  it('aponta o clipe que falta e o que mudou de duração', () => {
    const durations = allOf('knife')
    durations.delete('knife_stab')
    durations.set('knife_slash', 0.6)
    expect(clipDurationMismatches('knife', durations)).toEqual([
      'knife_stab: ausente do glb',
      'knife_slash: 0.6 s no glb, 0.42 s aqui',
    ])
  })
})

describe('sampleScalar', () => {
  const keys = [
    { atS: 0.1, value: 0 },
    { atS: 0.2, value: 1 },
  ]

  it('vale a primeira antes, a última depois, e suave no meio', () => {
    expect(sampleScalar(keys, 0)).toBe(0)
    expect(sampleScalar(keys, 1)).toBe(1)
    expect(sampleScalar(keys, 0.15)).toBeCloseTo(0.5)
  })

  it('sem chave, zero', () => {
    expect(sampleScalar([], 0.1)).toBe(0)
  })

  it('o corte da direita rola a câmera para o lado oposto do da esquerda', () => {
    const one = bladeClipSpec('katana', 'slash_1').roll ?? []
    const two = bladeClipSpec('katana', 'slash_2').roll ?? []
    expect(sampleScalar(two, 0.15)).toBeCloseTo(-sampleScalar(one, 0.15))
  })
})
