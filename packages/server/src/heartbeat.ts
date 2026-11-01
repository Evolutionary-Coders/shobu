/**
 * O heartbeat do WebSocket, nos nomes do `WebSocketTransport`: um ping a cada
 * `pingInterval`, e a conexão cai quando `pingMaxRetries` seguidos ficam sem
 * resposta (`@colyseus/ws-transport`, `autoTerminateUnresponsiveClients`).
 *
 * Regressão: com 1 s e 2 tentativas, um soluço de 2 a 3 s derrubava o jogador
 * (código 1006), e sem reconexão ele seguia jogando sozinho. Online, atrás do
 * ingress do Kubernetes e no wi-fi da feira, um soluço desses é comum; ao
 * carregar a cena, o notebook fraco compila shaders. Com 2 s e 4 tentativas, a
 * queda de verdade é detectada em 8 a 10 s, e até lá o corpo fica parado.
 *
 * ```ts
 * new WebSocketTransport({ server, ...SOCKET_HEARTBEAT })
 * ```
 */
export const SOCKET_HEARTBEAT = { pingInterval: 2000, pingMaxRetries: 4 } as const

/**
 * Quanto tempo de silêncio o heartbeat leva para cortar, do mais cedo ao mais
 * tarde: a contagem começa no ping seguinte à última resposta, e o corte vem
 * no tique em que a contagem já chegou ao máximo.
 *
 * ```ts
 * heartbeatCutWindowS(SOCKET_HEARTBEAT) // { earliestS: 8, latestS: 10 }
 * ```
 */
export function heartbeatCutWindowS(heartbeat: {
  readonly pingInterval: number
  readonly pingMaxRetries: number
}): { readonly earliestS: number; readonly latestS: number } {
  const intervalS = heartbeat.pingInterval / 1000
  return {
    earliestS: heartbeat.pingMaxRetries * intervalS,
    latestS: (heartbeat.pingMaxRetries + 1) * intervalS,
  }
}
