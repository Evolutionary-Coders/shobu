import { PING_REPORT_INTERVAL_S } from '@shobu/core'

/**
 * Se já é hora de mandar o rtt à sala de novo (`PING_REPORT_MESSAGE`). O tab
 * mostra o ping de todos, e um número a cada dois segundos basta para ele: a
 * cada tick seriam sessenta mensagens por segundo para uma coluna.
 *
 * ```ts
 * if (pingReportDue(lastS, nowS)) link.sendPing(link.rttMs())
 * ```
 */
export function pingReportDue(lastS: number, nowS: number): boolean {
  return nowS - lastS >= PING_REPORT_INTERVAL_S
}
