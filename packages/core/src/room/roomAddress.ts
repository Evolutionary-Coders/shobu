/**
 * O endereço da sala: um ipv4 fictício no caminho da url (ADR 0011). Não é o
 * endereço de máquina nenhuma, é o nome da sala com cara de ip.
 *
 * O texto aceito é o dotted-quad decimal de quatro octetos de 0 a 255, com até
 * três dígitos cada. Zero à esquerda é decimal, ao contrário do `inet_aton`,
 * que leria `010` como octal: o glossário decide que `10.0.0.07` é `10.0.0.7`.
 */

const OCTET = /^\d{1,3}$/

/**
 * As faixas de uso especial do ipv4 (registro da iana, RFC 6890): privadas,
 * loopback, link-local, documentação, benchmark, multicast e reservadas. O
 * gerador as evita para um endereço de sala não se confundir com o ip real de
 * uma máquina da rede do estande.
 */
const RESERVED_RANGES: readonly (readonly [readonly number[], number])[] = [
  [[0, 0, 0, 0], 8],
  [[10, 0, 0, 0], 8],
  [[100, 64, 0, 0], 10],
  [[127, 0, 0, 0], 8],
  [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12],
  [[192, 0, 0, 0], 24],
  [[192, 0, 2, 0], 24],
  [[192, 88, 99, 0], 24],
  [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15],
  [[198, 51, 100, 0], 24],
  [[203, 0, 113, 0], 24],
  [[224, 0, 0, 0], 4],
  [[240, 0, 0, 0], 4],
]

function octetsOf(text: string): readonly number[] | undefined {
  const parts = text.split('.')
  if (parts.length !== 4 || !parts.every((part) => OCTET.test(part))) return undefined
  const octets = parts.map(Number)
  return octets.every((octet) => octet <= 255) ? octets : undefined
}

/** Os quatro octetos como inteiro de 32 bits sem sinal; sem operador de bit, que teria sinal. */
function toUint32(octets: readonly number[]): number {
  return octets.reduce((value, octet) => value * 256 + octet, 0)
}

/**
 * A forma canônica do endereço, ou `undefined` se o texto não é endereço de sala.
 *
 * ```ts
 * parseRoomAddress('10.0.0.07') // '10.0.0.7'
 * ```
 */
export function parseRoomAddress(text: string): string | undefined {
  return octetsOf(text)?.join('.')
}

/**
 * ```ts
 * isReservedAddress('192.168.0.1') // true
 * ```
 */
export function isReservedAddress(address: string): boolean {
  const octets = octetsOf(address)
  if (!octets) {
    throw new RangeError(`isReservedAddress recebeu '${address}'; esperado endereço ipv4 de sala`)
  }
  const value = toUint32(octets)
  return RESERVED_RANGES.some(([base, prefix]) => {
    const blockSize = 2 ** (32 - prefix)
    return Math.floor(value / blockSize) === Math.floor(toUint32(base) / blockSize)
  })
}

/**
 * Um endereço de sala novo, fora das faixas reservadas. O sorteio é injetado:
 * o servidor passa um uint32 criptográfico, e o teste passa uma sequência fixa.
 *
 * ```ts
 * generateRoomAddress(() => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
 * ```
 */
export function generateRoomAddress(nextUint32: () => number): string {
  for (;;) {
    const value = nextUint32()
    const address = [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
    if (!isReservedAddress(address)) return address
  }
}
