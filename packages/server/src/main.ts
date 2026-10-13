import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRouter, defineRoom, defineServer } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import {
  blockoutToStaticBoxes,
  GREYBOX_BLOCKOUT,
  GREYBOX_SPAWN_POINTS_M,
  parseGameplayConfig,
  parseRoomAddress,
} from '@shobu/core'
import express from 'express'
import { createGameRoom } from './gameRoom.ts'
import { createMatchmaking, ROOM_NAME } from './matchmaking.ts'

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
 * A página e os assets do build. O caminho da sala tem ponto, como
 * `/203.0.113.7`, e o servidor estático o trataria como arquivo inexistente:
 * todo caminho que é endereço de sala devolve o `index.html` (ADR 0011).
 */
function servePage(app: express.Application): void {
  if (!existsSync(CLIENT_DIST)) return
  app.use(express.static(CLIENT_DIST))
  app.get('/:address', (req, res, next) => {
    if (parseRoomAddress(req.params.address) === undefined) return next()
    res.sendFile('index.html', { root: CLIENT_DIST })
  })
}

const matchmaking = createMatchmaking()

const server = defineServer({
  transport: new WebSocketTransport({
    pingInterval: HEARTBEAT_INTERVAL_MS,
    pingMaxRetries: HEARTBEAT_MISSES,
  }),
  rooms: {
    [ROOM_NAME]: defineRoom(
      createGameRoom({
        config,
        boxes: blockoutToStaticBoxes(GREYBOX_BLOCKOUT),
        spawns: GREYBOX_SPAWN_POINTS_M,
        lifecycle: matchmaking,
      }),
    ),
  },
  // o matchmaking pela URL troca o `joinOrCreate` do colyseus, que abria uma
  // segunda sala com o mesmo endereço quando a primeira enchia.
  routes: createRouter({ enterRoom: matchmaking.enterEndpoint }),
  express: servePage,
})

await server.listen(PORT)
console.log(JSON.stringify({ event: 'server.listening', port: PORT }))
