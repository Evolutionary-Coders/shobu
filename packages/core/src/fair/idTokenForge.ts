/**
 * Um ID token com a forma do Google e assinatura de mentira, para os testes
 * das três pontas: `readIdTokenClaims` não confere assinatura (ADR 0036).
 *
 * ```ts
 * forgeIdToken({ sub: 'conta-1', exp: 2_000_000_000, name: 'Ana' })
 * ```
 */
export function forgeIdToken(claims: Readonly<Record<string, unknown>>): string {
  const segment = (value: unknown): string =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${segment({ alg: 'RS256', typ: 'JWT' })}.${segment(claims)}.assinatura`
}
