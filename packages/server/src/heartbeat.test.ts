import { describe, expect, it } from 'vitest'
import { heartbeatCutWindowS, SOCKET_HEARTBEAT } from './heartbeat.ts'

describe('SOCKET_HEARTBEAT', () => {
  /**
   * Regressão: com 1 s e 2 tentativas, um soluço de 2 a 3 s na rede, ou a
   * página travada compilando shaders, derrubava o jogador com 1006.
   */
  it('aguenta um soluço de 5 s sem derrubar ninguém', () => {
    expect(heartbeatCutWindowS(SOCKET_HEARTBEAT).earliestS).toBeGreaterThan(5)
  })

  it('a queda de verdade sai da sala em até 10 s', () => {
    expect(heartbeatCutWindowS(SOCKET_HEARTBEAT).latestS).toBeLessThanOrEqual(10)
  })

  it('a janela é da contagem cheia até um intervalo depois', () => {
    expect(heartbeatCutWindowS({ pingInterval: 1000, pingMaxRetries: 2 })).toEqual({
      earliestS: 2,
      latestS: 3,
    })
  })
})
