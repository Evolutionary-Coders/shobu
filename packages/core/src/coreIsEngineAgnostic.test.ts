import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_ROOT = new URL('.', import.meta.url).pathname

/**
 * O domínio é proibido de importar a engine e o framework de rede (ADR 0001,
 * ADR 0002): é o que mantém a saída para three.js limitada aos adapters e o
 * que faz o mesmo módulo rodar no navegador e no node. Este teste é a trava —
 * um import de babylon dentro do núcleo é fácil de escrever e caro de desfazer.
 */
const FORBIDDEN_PACKAGES: readonly string[] = ['@babylonjs', 'babylonjs', 'colyseus']

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(directory, entry))
}

function importedPackages(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/from\s+'([^']+)'|import\('([^']+)'\)/g)].map(
    (match) => match[1] ?? match[2] ?? '',
  )
}

describe('@shobu/core', () => {
  it('encontra os próprios arquivos, senão o teste passaria vazio', () => {
    expect(sourceFiles(SOURCE_ROOT).length).toBeGreaterThan(3)
  })

  it.each(FORBIDDEN_PACKAGES)('não importa %s em nenhum arquivo', (forbidden) => {
    const offenders = sourceFiles(SOURCE_ROOT).filter((file) =>
      importedPackages(file).some((name) => name.startsWith(forbidden)),
    )
    expect(offenders).toEqual([])
  })
})
