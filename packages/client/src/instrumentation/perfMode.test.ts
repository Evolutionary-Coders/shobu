import { describe, expect, it } from 'vitest'
import { isColliderReview, isPerfMode, isReviewMode } from './perfMode.ts'

describe('isPerfMode', () => {
  it('liga só com perf=1', () => {
    expect(isPerfMode('?perf=1')).toBe(true)
    expect(isPerfMode('?tickHz=120&perf=1')).toBe(true)
    expect(isPerfMode('?perf=0')).toBe(false)
    expect(isPerfMode('')).toBe(false)
  })
})

describe('isReviewMode', () => {
  it('o competidor de revisão só aparece com revisao=1', () => {
    expect(isReviewMode('?revisao=1')).toBe(true)
    expect(isReviewMode('?perf=1')).toBe(false)
    expect(isReviewMode('')).toBe(false)
  })
})

describe('isColliderReview', () => {
  it('desenha a colisão só no modo de medição com colisao=1', () => {
    expect(isColliderReview('?perf=1&colisao=1')).toBe(true)
    expect(isColliderReview('?colisao=1')).toBe(false)
    expect(isColliderReview('?perf=1')).toBe(false)
  })
})
