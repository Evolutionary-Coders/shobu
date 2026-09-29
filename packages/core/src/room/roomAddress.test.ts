import { describe, expect, it } from 'vitest'
import { generateRoomAddress, isReservedAddress, parseRoomAddress } from './roomAddress.ts'

describe('parseRoomAddress', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['10.0.0.07', '10.0.0.7'],
    ['0.0.0.0', '0.0.0.0'],
    ['255.255.255.255', '255.255.255.255'],
  ])('%s é a sala %s', (text, canonical) => {
    expect(parseRoomAddress(text)).toBe(canonical)
  })

  /** O `inet_aton` leria 010 como octal, 8. O glossário decide decimal. */
  it('lê zero à esquerda como decimal, não octal', () => {
    expect(parseRoomAddress('010.0.0.1')).toBe('10.0.0.1')
  })

  it.each([
    '10.0.0.256',
    '10.0.0',
    '10.0.0.1.1',
    '10..0.1',
    '10.0.0.1 ',
    '10.0.0.+1',
    '10.0.0.0001',
    'a.b.c.d',
    '',
  ])('%j não é endereço de sala', (text) => {
    expect(parseRoomAddress(text)).toBeUndefined()
  })
})

describe('isReservedAddress', () => {
  it.each([
    '0.1.2.3',
    '10.20.30.40',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.0.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.1',
    '203.0.113.7',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
  ])('%s é reservado', (address) => {
    expect(isReservedAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '172.15.255.255', '172.32.0.0', '100.63.255.255', '198.20.0.0'])(
    '%s não é reservado',
    (address) => {
      expect(isReservedAddress(address)).toBe(false)
    },
  )

  it('recusa texto que não é endereço, dizendo qual', () => {
    expect(() => isReservedAddress('10.0.0.256')).toThrow(/'10\.0\.0\.256'/)
  })
})

describe('generateRoomAddress', () => {
  /** Sequência fixa de uint32: o gerador é determinístico dado o sorteio. */
  function sequence(...values: number[]): () => number {
    return () => {
      const next = values.shift()
      if (next === undefined) throw new Error('a sequência de teste acabou')
      return next
    }
  }

  it('monta o endereço com os quatro bytes do sorteio', () => {
    expect(generateRoomAddress(sequence(0x08080808))).toBe('8.8.8.8')
  })

  it('sorteia de novo quando cai em faixa reservada', () => {
    expect(generateRoomAddress(sequence(0xc0a80001, 0x0a000001, 0x5db8d822))).toBe('93.184.216.34')
  })
})
