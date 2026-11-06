import { describe, expect, it } from 'vitest'
import { isInStickZone, stickLayoutFromRects } from './touchStickLayout.ts'

const RING = { left: 28, top: 238, right: 156, bottom: 366 }
const ZONE = { left: 20, top: 130, right: 320, bottom: 374 }

describe('stickLayoutFromRects', () => {
  it('a base é o centro do anel e o raio é metade da largura', () => {
    const layout = stickLayoutFromRects(RING, ZONE)
    expect(layout.base).toEqual({ x: 92, y: 302 })
    expect(layout.radius).toBe(64)
    expect(layout.zone).toBe(ZONE)
  })
})

describe('isInStickZone', () => {
  const layout = stickLayoutFromRects(RING, ZONE)

  it('dentro da zona anda', () => {
    expect(isInStickZone({ x: 92, y: 302 }, layout)).toBe(true)
  })

  it('a borda conta como dentro', () => {
    expect(isInStickZone({ x: 20, y: 130 }, layout)).toBe(true)
    expect(isInStickZone({ x: 320, y: 374 }, layout)).toBe(true)
  })

  it.each([
    ['acima', { x: 92, y: 129 }],
    ['abaixo', { x: 92, y: 375 }],
    ['à esquerda', { x: 19, y: 302 }],
    ['à direita', { x: 321, y: 302 }],
  ])('%s da zona não anda', (_side, at) => {
    expect(isInStickZone(at, layout)).toBe(false)
  })
})
