import { PING_REPORT_INTERVAL_S } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { pingReportDue } from './pingReport.ts'

describe('pingReportDue', () => {
  it('nunca mandou: é hora', () => {
    expect(pingReportDue(Number.NEGATIVE_INFINITY, 0)).toBe(true)
  })

  it('espera o intervalo inteiro entre um relato e o seguinte', () => {
    expect(pingReportDue(10, 10 + PING_REPORT_INTERVAL_S - 0.01)).toBe(false)
    expect(pingReportDue(10, 10 + PING_REPORT_INTERVAL_S)).toBe(true)
  })
})
