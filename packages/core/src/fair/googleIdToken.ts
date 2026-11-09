/**
 * O que o jogo lê do ID token do Google (o `credential` do Google Sign-In):
 * quem é a conta e até quando o token vale.
 *
 * A assinatura **não** é conferida aqui, de propósito (ADR 0036): o token só
 * serve para ir à Feira, que é quem o valida. Um token forjado passa por aqui
 * e morre no POST de crédito, sem pagar nada. Conferir no jogo pediria a chave
 * pública do Google e uma dependência a mais para o mesmo resultado.
 */
export interface IdTokenClaims {
  /** O id estável da conta Google: é por ele que o crédito não sai duas vezes. */
  readonly sub: string
  /** Quando o token expira, em segundos desde a época. */
  readonly exp: number
  /** O nome da conta, para o menu mostrar com quem a pessoa entrou. */
  readonly name: string
}

/**
 * As claims do token, ou `undefined` se ele não tem a forma de um JWT do
 * Google: token de fora do jogo vira "sem login", não erro.
 *
 * ```ts
 * readIdTokenClaims(response.credential)?.sub
 * ```
 */
export function readIdTokenClaims(token: string): IdTokenClaims | undefined {
  const parts = token.split('.')
  if (parts.length !== 3) return undefined
  const payload = decodePayload(parts[1] as string)
  if (payload === undefined) return undefined
  const { sub, exp, name, email } = payload
  if (typeof sub !== 'string' || sub === '' || typeof exp !== 'number') return undefined
  return { sub, exp, name: displayNameOf(name, email) }
}

/**
 * Se o token ainda vale em `nowS` com folga de `marginS`: o POST leva um
 * tempo, e um token que expira no caminho é recusado pela Feira.
 *
 * ```ts
 * isIdTokenFresh(claims, Date.now() / 1000, 30)
 * ```
 */
export function isIdTokenFresh(
  claims: Readonly<IdTokenClaims>,
  nowS: number,
  marginS: number,
): boolean {
  return claims.exp - marginS > nowS
}

function displayNameOf(name: unknown, email: unknown): string {
  if (typeof name === 'string' && name !== '') return name
  if (typeof email === 'string') return email
  return ''
}

function decodePayload(segment: string): Record<string, unknown> | undefined {
  try {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}
