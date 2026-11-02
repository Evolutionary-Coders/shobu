import { describe, expect, it } from 'vitest'
import { voiceServerEndpoint } from './voiceServerEndpoint.ts'

const PAGE = { protocol: 'https:', hostname: 'shobu.example' }

describe('voiceServerEndpoint', () => {
  it('sem variável, ou com ela vazia, fica no host da página na 7880', () => {
    expect(voiceServerEndpoint({}, PAGE)).toBe('wss://shobu.example:7880')
    expect(voiceServerEndpoint({ VITE_VOICE_SERVER_URL: '' }, PAGE)).toBe(
      'wss://shobu.example:7880',
    )
  })

  /** Regressão: atrás de um Ingress a voz não está na 7880 do host da página, e nunca conectava. */
  it('usa a url inteira de VITE_VOICE_SERVER_URL, sem a barra do fim', () => {
    expect(voiceServerEndpoint({ VITE_VOICE_SERVER_URL: 'wss://voz.dominio/' }, PAGE)).toBe(
      'wss://voz.dominio',
    )
  })

  it('rejeita url que não é ws(s) citando o valor', () => {
    expect(() => voiceServerEndpoint({ VITE_VOICE_SERVER_URL: 'https://voz' }, PAGE)).toThrow(
      "VITE_VOICE_SERVER_URL='https://voz'",
    )
  })
})
