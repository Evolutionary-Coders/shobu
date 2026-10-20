import { existsSync, readFileSync } from 'node:fs'
import { createServer as createHttpsServer } from 'node:https'
import { fileURLToPath } from 'node:url'
import { createRouter, defineRoom, defineServer } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import {
  ICHIBAN_GAI_LAYOUT,
  NEON_KAIDO_LAYOUT,
  parseGameplayConfig,
  parseRoomAddress,
} from '@shobu/core'
import express from 'express'
import { createGameRoom } from './gameRoom.ts'
import { createMatchmaking, roomNameFor } from './matchmaking.ts'
import { roomRulesFor } from './roomSimulation.ts'
import { createVoiceAccess, relayMediaSignaling, type TlsCredentials } from './voiceAccess.ts'

/** A porta padrão do colyseus, a da Tabela 1 de `docs/rede/arquitetura-de-rede.md`. */
const PORT = 2567

/**
 * Sem reconexão, a queda silenciosa do wi-fi só é detectada pelo heartbeat:
 * ping a cada 1 s e desconexão após 2 sem resposta dão 2 a 3 s, contra 6 a 9 s
 * do padrão de 3 s (docs/rede, Tabela de parâmetros).
 */
const HEARTBEAT_INTERVAL_MS = 1000
const HEARTBEAT_MISSES = 2

const CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(CONFIG_URL, 'utf8')))

/** O build do cliente (`npm run build`). Sem ele, a página vem do vite em dev. */
const CLIENT_DIST = fileURLToPath(new URL('../../client/dist/', import.meta.url))

/**
 * Com `SHOBU_TLS_CERT` e `SHOBU_TLS_KEY` (caminhos em PEM), o servidor fala
 * HTTPS e WSS na mesma porta, e a sinalização da voz também passa a WSS; sem
 * os dois, HTTP puro, para o dev em localhost. Página HTTPS não abre `ws://`,
 * e o navegador só libera o microfone em contexto seguro (docs/rede, Topologia).
 */
function readTlsCredentials(env: NodeJS.ProcessEnv): TlsCredentials | undefined {
  const { SHOBU_TLS_CERT: certPath, SHOBU_TLS_KEY: keyPath } = env
  if (!certPath && !keyPath) return undefined
  if (!certPath || !keyPath) {
    throw new Error(
      `tls pela metade: SHOBU_TLS_CERT='${certPath}', SHOBU_TLS_KEY='${keyPath}'; esperado os dois caminhos ou nenhum`,
    )
  }
  return { cert: readFileSync(certPath), key: readFileSync(keyPath) }
}

/**
 * A página e os assets do build. O caminho da sala tem ponto, como
 * `/203.0.113.7`, e o servidor estático o trataria como arquivo inexistente:
 * todo caminho que é endereço de sala devolve o `index.html` (ADR 0028).
 */
function servePage(app: express.Application): void {
  logClientStats(app)
  if (!existsSync(CLIENT_DIST)) return
  app.use(express.static(CLIENT_DIST))
  app.get('/:address', (req, res, next) => {
    if (parseRoomAddress(req.params.address) === undefined) return next()
    res.sendFile('index.html', { root: CLIENT_DIST })
  })
}

/**
 * O resumo de rede que o cliente em `?perf=1` manda a cada janela
 * (`netStats.ts`), no log do servidor, ao lado do que o servidor mede. Só
 * registra: é medição, e um corpo que não é JSON vira uma linha de aviso.
 */
function logClientStats(app: express.Application): void {
  app.post('/perf/stats', express.text({ limit: '4kb' }), (req, res) => {
    try {
      const stats = JSON.parse(String(req.body)) as object
      console.log(JSON.stringify({ ...stats, event: 'client.stats', ip: req.ip }))
    } catch {
      console.log(JSON.stringify({ event: 'client.stats-invalid', ip: req.ip }))
    }
    res.sendStatus(204)
  })
}

const tls = readTlsCredentials(process.env)
const tlsServer = tls && createHttpsServer(tls)
/** Os mapas que uma sala pode ter; o primeiro é o de quem não pediu um do catálogo. */
const ARENA_LAYOUTS = [NEON_KAIDO_LAYOUT, ICHIBAN_GAI_LAYOUT]
const matchmaking = createMatchmaking(
  NEON_KAIDO_LAYOUT.id,
  ARENA_LAYOUTS.map((layout) => layout.id),
)
const voice = createVoiceAccess(process.env)
if (voice) relayMediaSignaling(tls)

const server = defineServer({
  transport: new WebSocketTransport({
    server: tlsServer,
    pingInterval: HEARTBEAT_INTERVAL_MS,
    pingMaxRetries: HEARTBEAT_MISSES,
  }),
  // a sala tem o mapa de quem a criou; o voto de mapa no servidor (ADR 0022)
  // ainda não existe, e a sala fica no mesmo mapa enquanto durar.
  rooms: Object.fromEntries(
    ARENA_LAYOUTS.map((layout) => [
      roomNameFor(layout.id),
      defineRoom(
        createGameRoom({ ...roomRulesFor(layout, config), lifecycle: matchmaking, voice }),
      ),
    ]),
  ),
  // o matchmaking pela URL troca o `joinOrCreate` do colyseus, que abria uma
  // segunda sala com o mesmo endereço quando a primeira enchia.
  routes: createRouter({ enterRoom: matchmaking.enterEndpoint }),
  express: servePage,
})

await server.listen(PORT)
console.log(
  JSON.stringify({
    event: 'server.listening',
    port: PORT,
    tls: tlsServer !== undefined,
    voice: voice !== undefined,
  }),
)
