import { describe, expect, it } from 'vitest'
import { isPerfMode } from './perfMode.ts'

describe('isPerfMode', () => {
  it('liga só com perf=1', () => {
    expect(isPerfMode('?perf=1')).toBe(true)
    expect(isPerfMode('?tickHz=120&perf=1')).toBe(true)
    expect(isPerfMode('?perf=0')).toBe(false)
    expect(isPerfMode('')).toBe(false)
  })
})
