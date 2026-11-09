import { describe, expect, it } from 'vitest'
import { gameServerUrl, roomAddressInPath } from './roomLocation.ts'

describe('roomAddressInPath', () => {
  it('usa o endereço do caminho', () => {
    expect(roomAddressInPath('/203.0.113.7')).toBe('203.0.113.7')
  })

  /** Dois amigos com `10.0.0.07` e `10.0.0.7` têm que cair na mesma sala. */
  it('normaliza o caminho para a forma canônica', () => {
    expect(roomAddressInPath('/10.0.0.07/')).toBe('10.0.0.7')
  })

  /** Sem endereço, a sala sai do menu: a partida rápida ou a nova partida. */
  it.each(['/', '', '/sala', '/10.0.0.256'])('não acha endereço em %j', (pathname) => {
    expect(roomAddressInPath(pathname)).toBeUndefined()
  })
})

describe('gameServerUrl', () => {
  it('usa wss quando a página vem por https, porque página https não abre ws://', () => {
    expect(gameServerUrl({ protocol: 'https:', hostname: 'shobu.example' }, 2567)).toBe(
      'wss://shobu.example:2567',
    )
  })

  it('usa ws quando a página vem por http', () => {
    expect(gameServerUrl({ protocol: 'http:', hostname: 'localhost' }, 2567)).toBe(
      'ws://localhost:2567',
    )
  })
})
