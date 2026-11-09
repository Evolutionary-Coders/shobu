import { PRIMARY_WEAPONS } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { TRACER_STYLES } from './tracerStyles.ts'

describe('TRACER_STYLES', () => {
  /** O pedido: o feixe da laser brilha no neon vermelho #ff2a3d. */
  it('o halo da laser é o #ff2a3d', () => {
    expect(TRACER_STYLES.laser.halo.map((channel) => Math.round(channel * 255))).toEqual([
      0xff, 0x2a, 0x3d,
    ])
  })

  /** Regressão: a clássica fica com o feixe que tinha antes da laser existir. */
  it('a clássica mantém as cores e a largura de sempre', () => {
    expect(TRACER_STYLES.classic).toEqual({
      core: [1, 0.93, 0.8],
      halo: [1, 0.22, 0.28],
      head: [1, 0.97, 0.9],
      haloWidthScale: 1,
    })
  })

  it('toda cor de todo feixe está entre 0 e 1', () => {
    const channels = PRIMARY_WEAPONS.flatMap((weapon) => {
      const { core, halo, head } = TRACER_STYLES[weapon]
      return [...core, ...halo, ...head]
    })
    expect(channels.every((channel) => channel >= 0 && channel <= 1)).toBe(true)
  })
})
