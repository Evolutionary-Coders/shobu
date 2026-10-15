import { blockBetween } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { layoutFingerprint } from './layoutFingerprint.ts'

const piso = blockBetween('piso', 'floor', 'rua', [-24, -1, -30], [24, 0, 30])
const mercado = blockBetween('mercado', 'building', 'mercado', [7, 0, 10], [17, 9, 22])

describe('layoutFingerprint', () => {
  it('são oito dígitos hexadecimais', () => {
    expect(layoutFingerprint([piso, mercado])).toMatch(/^[0-9a-f]{8}$/)
  })

  it('é a mesma para o mesmo layout', () => {
    expect(layoutFingerprint([piso, mercado])).toBe(layoutFingerprint([piso, mercado]))
  })

  it('muda quando uma caixa muda de lugar', () => {
    const moved = { ...mercado, centerM: [12.5, 4.5, 16] as const }
    expect(layoutFingerprint([piso, moved])).not.toBe(layoutFingerprint([piso, mercado]))
  })

  it('muda quando a ordem muda, porque a ordem é o que o blender percorre', () => {
    expect(layoutFingerprint([mercado, piso])).not.toBe(layoutFingerprint([piso, mercado]))
  })

  it('ignora ruído abaixo do milímetro e o sinal de zero', () => {
    const noisy = { ...piso, centerM: [-0, -0.5000001, 0] as const }
    expect(layoutFingerprint([noisy])).toBe(layoutFingerprint([piso]))
  })

  it('de layout vazio ainda devolve uma impressão', () => {
    expect(layoutFingerprint([])).toBe('811c9dc5')
  })
})
