import { describe, expect, it } from 'vitest'
import { createStartGestureReader, START_HOLD_MS, startActionFor } from './startGesture.ts'

describe('createStartGestureReader', () => {
  it('apertar e soltar logo é toque', () => {
    const start = createStartGestureReader()
    expect(start.read(true, 0)).toBeUndefined()
    expect(start.read(true, 100)).toBeUndefined()
    expect(start.read(false, 150)).toBe('tap')
  })

  it('segurar dispara ao completar o tempo, ainda preso, e uma vez só', () => {
    const start = createStartGestureReader()
    start.read(true, 0)
    expect(start.read(true, START_HOLD_MS - 1)).toBeUndefined()
    expect(start.read(true, START_HOLD_MS)).toBe('hold')
    expect(start.read(true, START_HOLD_MS * 3)).toBeUndefined()
  })

  it('soltar depois de segurar não vira toque', () => {
    const start = createStartGestureReader()
    start.read(true, 0)
    start.read(true, START_HOLD_MS)
    expect(start.read(false, START_HOLD_MS + 50)).toBeUndefined()
  })

  it('solto, sem aperto antes, não dispara nada', () => {
    expect(createStartGestureReader().read(false, 0)).toBeUndefined()
  })

  it('o segundo aperto conta do zero', () => {
    const start = createStartGestureReader()
    start.read(true, 0)
    start.read(false, 100)
    start.read(true, 1000)
    expect(start.read(true, 1000 + START_HOLD_MS - 1)).toBeUndefined()
  })
})

describe('startActionFor', () => {
  it('no óculos, toque recentra e segurar sai', () => {
    expect(startActionFor('tap', true)).toBe('recenter')
    expect(startActionFor('hold', true)).toBe('leave-headset')
  })

  it('fora do óculos, os dois pausam', () => {
    expect(startActionFor('tap', false)).toBe('pause')
    expect(startActionFor('hold', false)).toBe('pause')
  })
})
