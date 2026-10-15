import { describe, expect, it } from 'vitest'
import { gameServerUrl, resolveRoomAddress } from './roomLocation.ts'

/** Sorteio fixo: o primeiro uint32 dá 93.184.216.34, fora das faixas reservadas. */
const DRAW = (): number => 0x5db8d822

describe('resolveRoomAddress', () => {
  it('usa o endereço do caminho', () => {
    expect(resolveRoomAddress('/203.0.113.7', DRAW)).toEqual({
      address: '203.0.113.7',
      path: '/203.0.113.7',
    })
  })

  /** Dois amigos com `10.0.0.07` e `10.0.0.7` têm que cair na mesma sala. */
  it('normaliza o caminho para a forma canônica', () => {
    expect(resolveRoomAddress('/10.0.0.07/', DRAW)).toEqual({
      address: '10.0.0.7',
      path: '/10.0.0.7',
    })
  })

  it.each(['/', '', '/sala', '/10.0.0.256'])('sorteia um endereço novo para %j', (pathname) => {
    expect(resolveRoomAddress(pathname, DRAW)).toEqual({
      address: '93.184.216.34',
      path: '/93.184.216.34',
    })
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
