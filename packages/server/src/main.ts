import { readFileSync } from 'node:fs'
import { defineRoom, defineServer } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import {
  blockoutToStaticBoxes,
  GREYBOX_BLOCKOUT,
  GREYBOX_SPAWN_POINTS_M,
  parseGameplayConfig,
} from '@shobu/core'
import { createGameRoom } from './gameRoom.ts'

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

const server = defineServer({
  transport: new WebSocketTransport({
    pingInterval: HEARTBEAT_INTERVAL_MS,
    pingMaxRetries: HEARTBEAT_MISSES,
  }),
  rooms: {
    arena: defineRoom(
      createGameRoom({
        config,
        boxes: blockoutToStaticBoxes(GREYBOX_BLOCKOUT),
        spawns: GREYBOX_SPAWN_POINTS_M,
      }),
    ).filterBy(['address']),
  },
})

await server.listen(PORT)
console.log(JSON.stringify({ event: 'server.listening', port: PORT }))
