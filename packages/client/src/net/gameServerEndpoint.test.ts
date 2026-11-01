import { describe, expect, it } from 'vitest'
import { gameServerEndpoint } from './gameServerEndpoint.ts'

const PAGE = { protocol: 'https:', hostname: 'shobu.example' }

describe('gameServerEndpoint', () => {
  it('sem variável, fica no host da página na 2567, como sempre', () => {
    expect(gameServerEndpoint({}, PAGE)).toBe('wss://shobu.example:2567')
  })

  /** As pilhas de teste em paralelo sobem cada servidor numa porta. */
  it('usa a porta de VITE_GAME_SERVER_PORT', () => {
    expect(gameServerEndpoint({ VITE_GAME_SERVER_PORT: '2577' }, PAGE)).toBe(
      'wss://shobu.example:2577',
    )
  })

  it('rejeita porta inválida citando o valor', () => {
    expect(() => gameServerEndpoint({ VITE_GAME_SERVER_PORT: 'x' }, PAGE)).toThrow(
      "VITE_GAME_SERVER_PORT='x'",
    )
  })

  /** Atrás de um Ingress o servidor não está numa porta do host da página. */
  it('usa a url inteira de VITE_GAME_SERVER_URL, e ela vence a porta', () => {
    const env = { VITE_GAME_SERVER_URL: 'wss://jogo.dominio/ws', VITE_GAME_SERVER_PORT: '2577' }
    expect(gameServerEndpoint(env, PAGE)).toBe('wss://jogo.dominio/ws')
  })

  /** A rota de perf e a do colyseus emendam `/caminho` na url. */
  it('tira a barra do fim da url', () => {
    expect(gameServerEndpoint({ VITE_GAME_SERVER_URL: 'ws://10.0.0.2:2567/' }, PAGE)).toBe(
      'ws://10.0.0.2:2567',
    )
  })

  /** O `.env` com a linha vazia é o mesmo que sem a variável. */
  it('trata a url vazia como ausente', () => {
    expect(gameServerEndpoint({ VITE_GAME_SERVER_URL: '' }, PAGE)).toBe('wss://shobu.example:2567')
  })

  it.each(['https://jogo.dominio', 'jogo.dominio:2567', 'wss://', 'ws:// x'])(
    'rejeita %j citando o valor',
    (url) => {
      expect(() => gameServerEndpoint({ VITE_GAME_SERVER_URL: url }, PAGE)).toThrow(
        `VITE_GAME_SERVER_URL='${url}'`,
      )
    },
  )
})
