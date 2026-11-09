import { describe, expect, it } from 'vitest'
import { checkClientEnv } from './clientEnvCheck.ts'

describe('checkClientEnv', () => {
  it('aceita o build sem variável nenhuma, e com as vazias', () => {
    expect(() => checkClientEnv({})).not.toThrow()
    expect(() =>
      checkClientEnv({ VITE_GAME_SERVER_URL: '', VITE_GAME_SERVER_PORT: '' }),
    ).not.toThrow()
  })

  it('aceita a url do Ingress e ignora o que não é texto', () => {
    expect(() =>
      checkClientEnv({ VITE_GAME_SERVER_URL: 'wss://jogo.dominio/ws', VITE_GAME_SERVER_PORT: 7 }),
    ).not.toThrow()
  })

  /** Regressão: o valor errado só aparecia no navegador, com o bundle já publicado. */
  it.each([
    [
      { VITE_GAME_SERVER_URL: 'https://jogo.dominio' },
      "VITE_GAME_SERVER_URL='https://jogo.dominio'",
    ],
    [{ VITE_GAME_SERVER_PORT: '70000' }, "VITE_GAME_SERVER_PORT='70000'"],
    [{ VITE_VOICE_SERVER_URL: 'voz.dominio' }, "VITE_VOICE_SERVER_URL='voz.dominio'"],
  ])('falha o build citando o valor: %j', (env, quoted) => {
    expect(() => checkClientEnv(env)).toThrow(quoted)
  })
})
