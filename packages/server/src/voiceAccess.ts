import { connect, createServer as createTcpServer, type Socket } from 'node:net'
import { pipeline } from 'node:stream'
import { createServer as createTlsServer } from 'node:tls'
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'

/**
 * Quem fala em cada sala de voz, decidido pelo servidor de jogo (ADR 0026).
 * A sala de voz tem o `roomId` da sala de jogo, e o participante, o `sessionId`.
 */
export interface VoiceAccess {
  /** O token de entrada na sala de voz: só microfone, sem vídeo nem dados. */
  ticketFor(roomId: string, sessionId: string): Promise<string>
  /** Tira o jogador da sala de voz quando ele sai da sala de jogo. */
  remove(roomId: string, sessionId: string): void
}

/**
 * A sinalização do servidor de mídia que o navegador vê, a da Tabela 1 de
 * docs/rede, e a porta do LiveKit, só no loopback. O LiveKit não tem TLS na
 * sinalização, só no TURN: o servidor de jogo termina o TLS na 7880 e repassa
 * para ele. A API dele, Twirp sobre HTTP, vai direto pelo loopback.
 */
const MEDIA_SIGNALING_PORT = 7880
const MEDIA_SERVER_PORT = 7890
const MEDIA_SERVER_API = `http://127.0.0.1:${MEDIA_SERVER_PORT}`

/** Certificado e chave em PEM, os mesmos da página e do canal de jogo. */
export interface TlsCredentials {
  readonly cert: Buffer
  readonly key: Buffer
}

/**
 * O token só serve para entrar: depois da conexão, o servidor de mídia o
 * renova sozinho. Um minuto cobre a ida do token ao cliente e a conexão.
 */
const TICKET_TTL_S = 60

/**
 * Lê `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`, as do `keys` do servidor de
 * mídia. Sem as duas, devolve `undefined` e o jogo roda sem voz.
 *
 * ```ts
 * const voice = createVoiceAccess(process.env)
 * ```
 */
export function createVoiceAccess(env: NodeJS.ProcessEnv): VoiceAccess | undefined {
  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = env
  if (!apiKey && !apiSecret) return undefined
  if (!apiKey || !apiSecret) {
    throw new Error(
      `chave de voz pela metade: LIVEKIT_API_KEY='${apiKey}', LIVEKIT_API_SECRET ${apiSecret ? 'definida' : 'vazia'}; esperado as duas ou nenhuma`,
    )
  }
  const rooms = new RoomServiceClient(MEDIA_SERVER_API, apiKey, apiSecret)
  return {
    ticketFor: (roomId, sessionId) => signTicket(apiKey, apiSecret, roomId, sessionId),
    remove: (roomId, sessionId) => {
      // quem fechou a aba já saiu da voz sozinho, e o servidor de mídia responde
      // que não o encontrou: só registra.
      rooms.removeParticipant(roomId, sessionId).catch((error: unknown) => {
        console.log(
          JSON.stringify({ event: 'voice.remove-failed', roomId, sessionId, error: String(error) }),
        )
      })
    },
  }
}

function signTicket(
  apiKey: string,
  apiSecret: string,
  roomId: string,
  sessionId: string,
): Promise<string> {
  const token = new AccessToken(apiKey, apiSecret, { identity: sessionId, ttl: TICKET_TTL_S })
  token.addGrant({
    roomJoin: true,
    room: roomId,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canSubscribe: true,
  })
  return token.toJwt()
}

/**
 * Repassa a sinalização da voz da 7880 para o LiveKit, com TLS quando há
 * certificado. Repasse de bytes, sem olhar o HTTP: o WebSocket e o `Upgrade`
 * passam inteiros. No Kubernetes, o LiveKit roda no mesmo pod, que é onde o
 * loopback é compartilhado.
 *
 * ```ts
 * if (voice) relayMediaSignaling(tls)
 * ```
 */
export function relayMediaSignaling(tls: TlsCredentials | undefined): void {
  const relay = (socket: Socket): void => {
    const upstream = connect(MEDIA_SERVER_PORT, '127.0.0.1')
    // o pipeline fecha os dois lados quando um cai, e o erro de um lado só
    // derruba esta conexão, não o servidor.
    pipeline(socket, upstream, socket, () => undefined)
  }
  const server = tls ? createTlsServer(tls, relay) : createTcpServer(relay)
  server.listen(MEDIA_SIGNALING_PORT)
}
