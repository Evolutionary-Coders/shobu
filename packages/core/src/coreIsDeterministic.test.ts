import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = new URL('.', import.meta.url).pathname

/**
 * O núcleo tem que chegar ao **mesmo** resultado no navegador e no servidor, a
 * partir da mesma entrada (ADR 0003): é o que permite a predição no cliente e a
 * validação no servidor concordarem, e o que o nfr.md chama de "o número que
 * decide o jogo". Três famílias quebram isso:
 *
 * - `Math.random`: sem semente, não há reprodução possível.
 * - `Math.sin/cos/tan`: a especificação IEEE não fixa o último bit, e
 *   implementações diferem entre motores e versões.
 * - `Date.now` e `performance.now`: relógio de parede não é entrada da
 *   simulação; tempo entra por `dtS`, que o chamador fornece.
 *
 * Este teste é a trava. Cada uma dessas chamadas é fácil de escrever sem
 * pensar e cara de descobrir depois, porque o defeito só aparece com dois
 * computadores diferentes na mesma partida.
 */
const FORBIDDEN_CALLS: readonly string[] = [
  'Math.random',
  'Math.sin',
  'Math.cos',
  'Math.tan',
  'Date.now',
  'performance.now',
]

/**
 * As exceções declaradas, por arquivo. Vazia hoje. O mecanismo existe porque a
 * ADR 0003 já prevê o caso inevitável — "tabelar ou fixar precisão" — e quando
 * ele chegar a exceção fica **aqui, nomeada**, em vez de o teste ser afrouxado.
 */
const ALLOWED_CALLS: ReadonlyMap<string, readonly string[]> = new Map()

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
    .map((entry) => entry.replaceAll('\\', '/'))
}

/**
 * Sem comentário e sem string: a docstring deste projeto **fala** de
 * `Math.random` para dizer que ele é proibido, e um teste que lê prosa acusaria
 * justamente quem documenta a regra.
 */
function codeOf(file: string): string {
  return readFileSync(join(SOURCE_ROOT, file), 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/\/\/[^\n]*/g, ' ')
    .replaceAll(/'[^'\n]*'/g, "''")
}

function offenders(call: string): readonly string[] {
  return sourceFiles(SOURCE_ROOT).filter((file) => {
    if (ALLOWED_CALLS.get(file)?.includes(call)) return false
    return codeOf(file).includes(`${call}(`)
  })
}

describe('@shobu/core é determinístico', () => {
  it('encontra os próprios arquivos, senão o teste passaria vazio', () => {
    expect(sourceFiles(SOURCE_ROOT).length).toBeGreaterThan(3)
  })

  it.each(FORBIDDEN_CALLS)('não chama %s fora da lista de exceções', (call) => {
    expect(offenders(call)).toEqual([])
  })

  /** Exceção que sobrevive ao arquivo que a justificava vira permissão silenciosa. */
  it('a lista de exceções só cita arquivo que existe', () => {
    const existing = new Set(sourceFiles(SOURCE_ROOT))
    for (const file of ALLOWED_CALLS.keys()) expect(existing.has(file)).toBe(true)
  })
})
