import { describe, expect, it } from 'vitest'
import { createLatestRequest } from './latestRequest.ts'

describe('createLatestRequest', () => {
  it('o único pedido é o último', () => {
    const latest = createLatestRequest()
    expect(latest.isLatest(latest.stamp())).toBe(true)
  })

  it('o pedido anterior fica velho, mesmo se o download dele chegar depois', () => {
    // regressão: duas falas baixando juntas, e a que chegava por último tocava
    // por cima da outra, ainda que tivesse sido pedida antes.
    const latest = createLatestRequest()
    const older = latest.stamp()
    const newer = latest.stamp()
    expect(latest.isLatest(older)).toBe(false)
    expect(latest.isLatest(newer)).toBe(true)
  })

  it('cada pedido tem seu número', () => {
    const latest = createLatestRequest()
    expect(latest.stamp()).not.toBe(latest.stamp())
  })
})
