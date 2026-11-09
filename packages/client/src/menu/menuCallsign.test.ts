import { DEFAULT_PROFILE_NAME } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { announceMenuCallsign } from './menuCallsign.ts'

/** A porta de rede, só com o nome: guarda o que recebeu. */
class FakeCallsignPort {
  readonly callsigns: string[] = []

  chooseCallsign(callsign: string): void {
    this.callsigns.push(callsign)
  }
}

describe('announceMenuCallsign', () => {
  /** Regressão: o nome só ia na entrada na arena, e quem esperava no menu era AGENTE. */
  it('manda o nome do perfil, como a arena o mostra', () => {
    const port = new FakeCallsignPort()
    announceMenuCallsign(port, '  raiden ')
    expect(port.callsigns).toEqual(['RAIDEN'])
  })

  it('sem nome, manda o padrão', () => {
    const port = new FakeCallsignPort()
    announceMenuCallsign(port, '')
    expect(port.callsigns).toEqual([DEFAULT_PROFILE_NAME])
  })
})
