import type { WireInput } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { FakeGameLink, WALK } from './gameLinkFake.ts'
import { createNetworkPort } from './networkPort.ts'

describe('o relato do ping', () => {
  /** O tab dos outros mostra o rtt deste cliente, que só ele mede (ADR 0015). */
  it('vai com o input, no máximo um a cada intervalo, e só com amostra', () => {
    const clock = { nowS: 0 }
    const port = createNetworkPort(() => clock.nowS)
    const link = new FakeGameLink()
    port.attach(link)
    port.sendTickInput(WALK)
    expect(link.pings).toEqual([])
    link.rtt = 48
    port.sendTickInput(WALK)
    clock.nowS = 1
    port.sendTickInput(WALK)
    clock.nowS = 2
    port.sendTickInput(WALK)
    expect(link.pings).toEqual([48, 48])
  })

  it('sem sala, não manda nada', () => {
    expect(createNetworkPort(() => 0).sendTickInput(WALK)).toBeUndefined()
  })
})

describe('o aviso de inatividade', () => {
  const STILL: WireInput = { ...WALK, wishZ: 0 }

  function warned() {
    const clock = { nowS: 10 }
    const port = createNetworkPort(() => clock.nowS)
    const link = new FakeGameLink()
    port.attach(link)
    port.sendTickInput(STILL)
    link.warnAfk(15)
    return { clock, port, link }
  }

  it('conta os segundos até a saída desde o aviso, sem passar de zero', () => {
    const { clock, port } = warned()
    expect(port.afkSecondsLeft()).toBe(15)
    clock.nowS = 14
    expect(port.afkSecondsLeft()).toBe(11)
    clock.nowS = 99
    expect(port.afkSecondsLeft()).toBe(0)
  })

  it('o tick parado não apaga; o que mexe, apaga', () => {
    const { port } = warned()
    port.sendTickInput(STILL)
    expect(port.afkSecondsLeft()).toBe(15)
    port.sendTickInput(WALK)
    expect(port.afkSecondsLeft()).toBeUndefined()
  })

  it('sem aviso, ou sem sala, não há conta', () => {
    const { port, link } = warned()
    link.close()
    expect(port.afkSecondsLeft()).toBeUndefined()
    expect(createNetworkPort().afkSecondsLeft()).toBeUndefined()
  })

  it('a sala nova começa sem aviso', () => {
    const { port } = warned()
    port.attach(new FakeGameLink())
    expect(port.afkSecondsLeft()).toBeUndefined()
  })
})

describe('o fechamento da sala', () => {
  /** O menu explica a saída por inatividade pelo código do fechamento. */
  it('avisa cada ouvinte com o código', () => {
    const port = createNetworkPort()
    const link = new FakeGameLink()
    const codes: (number | undefined)[] = []
    port.onRoomClosed((code) => codes.push(code))
    port.attach(link)
    link.close(4002)
    expect(codes).toEqual([4002])
  })

  it('a sala velha que fecha depois da troca não avisa', () => {
    const port = createNetworkPort()
    const old = new FakeGameLink()
    const codes: (number | undefined)[] = []
    port.onRoomClosed((code) => codes.push(code))
    port.attach(old)
    port.attach(new FakeGameLink())
    old.close(4000)
    expect(codes).toEqual([])
  })
})
