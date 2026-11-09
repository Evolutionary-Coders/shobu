/**
 * O que muda de um lugar onde o jogo roda para outro — a máquina de dev, as
 * pilhas de teste em paralelo, o cluster da feira —, lido das variáveis de
 * ambiente pelas duas pontas. Os padrões são os do repositório: sem nenhuma
 * variável, tudo roda como sempre rodou.
 */

/** As variáveis que esta leitura entende; o resto do ambiente não importa aqui. */
export type DeployEnv = Readonly<Record<string, string | undefined>>

/** O `config/gameplay.json` da raiz, a fonte única da ADR 0005. */
export const DEFAULT_GAMEPLAY_CONFIG = 'config/gameplay.json'

/**
 * A porta da variável `name`, ou `fallback` sem ela. Porta que não é um
 * inteiro de 1 a 65535 é erro de quem configurou, e para o processo citando o
 * valor: cair no padrão em silêncio subiria a pilha na porta de outra.
 *
 * ```ts
 * portSetting(process.env, 'PORT', 2567) // 2567, ou a de PORT=2577
 * ```
 */
export function portSetting(env: DeployEnv, name: string, fallback: number): number {
  return integerSetting(env, name, fallback, { min: 1, max: 65535 })
}

/**
 * O inteiro da variável `name`, de `min` a `max`, ou `fallback` sem ela.
 * Valor fora disso, vazio incluído, para o processo citando-o, como
 * `portSetting`: cair no padrão em silêncio esconderia o erro de quem configurou.
 *
 * ```ts
 * integerSetting(process.env, 'FAIR_CREDIT_CAP', 10, { min: 0 }) // 10, ou o de FAIR_CREDIT_CAP=5
 * ```
 */
export function integerSetting(
  env: DeployEnv,
  name: string,
  fallback: number,
  { min, max = Number.MAX_SAFE_INTEGER }: { readonly min: number; readonly max?: number },
): number {
  const text = env[name]
  if (text === undefined) return fallback
  const value = /^\d+$/.test(text) ? Number(text) : Number.NaN
  if (Number.isSafeInteger(value) && value >= min && value <= max) return value
  const range = max === Number.MAX_SAFE_INTEGER ? `a partir de ${min}` : `de ${min} a ${max}`
  throw new Error(`${name}='${text}' inválida; esperado um inteiro ${range}`)
}

/**
 * O arquivo de gameplay que servidor e cliente leem: `GAMEPLAY_CONFIG`, caminho
 * absoluto ou relativo à raiz do repositório, ou o versionado. As duas pontas
 * resolvem contra a mesma raiz, então veem o mesmo arquivo seja qual for a
 * pasta de onde o npm subiu cada uma.
 *
 * ```ts
 * gameplayConfigUrl(process.env, new URL('../../../', import.meta.url))
 * ```
 */
export function gameplayConfigUrl(env: DeployEnv, repoRoot: URL): URL {
  const path = env.GAMEPLAY_CONFIG ?? DEFAULT_GAMEPLAY_CONFIG
  if (path.trim() === '') {
    throw new Error(
      `GAMEPLAY_CONFIG='${path}' vazia; esperado o caminho de um gameplay.json, ou a variável ausente`,
    )
  }
  return new URL(path, repoRoot)
}
