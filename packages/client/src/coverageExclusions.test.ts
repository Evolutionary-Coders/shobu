import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { IO_ADAPTERS } from '../../../vitest.config.ts'

/**
 * A lista de exclusão de cobertura é a única porta de saída do teto de 100%
 * (ADR 0007), e este teste é a tranca dela. Sem ele, "esta função é difícil de
 * testar" bastaria para tirar qualquer arquivo da conta — e a trava de
 * cobertura passaria a medir só o que já estava coberto.
 *
 * O critério é o mesmo da ADR 0001: fica de fora quem fala com a engine, com o
 * dom ou com a rede, porque nenhum teste deste projeto abre navegador.
 */
const REPO_ROOT = new URL('../../../', import.meta.url)

const ADAPTER_MARKS: readonly RegExp[] = [
  /@babylonjs/,
  /\bdocument\./,
  /\bwindow\./,
  /HTML[A-Za-z]*Element/,
  /\bfetch\(/,
  /\bperformance\./,
]

function sourceOf(file: string): string {
  return readFileSync(new URL(file, REPO_ROOT), 'utf8')
}

describe('exclusões de cobertura', () => {
  it('lista algum arquivo, senão o teste passaria vazio', () => {
    expect(IO_ADAPTERS.length).toBeGreaterThan(0)
  })

  it.each(IO_ADAPTERS)('%s existe', (file) => {
    expect(() => sourceOf(file)).not.toThrow()
  })

  it.each(IO_ADAPTERS)('%s é adapter de engine, dom ou rede', (file) => {
    const source = sourceOf(file)
    const marks = ADAPTER_MARKS.filter((mark) => mark.test(source)).map(String)
    expect(marks, `${file} não toca engine, dom nem rede: teste em vez de excluir`).not.toEqual([])
  })
})
