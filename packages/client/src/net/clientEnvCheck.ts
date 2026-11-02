import { type GameServerEnv, gameServerEndpoint } from './gameServerEndpoint.ts'

/**
 * Uma página qualquer, só para as variáveis serem lidas como o navegador as
 * leria: o que se confere é a forma delas, não o host em que a página roda.
 */
const BUILD_TIME_PAGE = { protocol: 'https:', hostname: 'build.invalid' }

/**
 * Confere, no build, as variáveis do vite que o cliente lê, com as mesmas
 * regras que o boot aplica: o build falha citando o valor errado, em vez de
 * sair um bundle que só quebra no navegador de quem joga. Lança o primeiro
 * erro achado.
 *
 * ```ts
 * checkClientEnv(config.env) // no `configResolved` do plugin do vite
 * checkClientEnv({ VITE_GAME_SERVER_PORT: 'x' }) // Error: VITE_GAME_SERVER_PORT='x' inválida; ...
 * ```
 */
export function checkClientEnv(env: Readonly<Record<string, unknown>>): void {
  gameServerEndpoint(textVariables<GameServerEnv>(env, GAME_SERVER_VARIABLES), BUILD_TIME_PAGE)
}

const GAME_SERVER_VARIABLES = ['VITE_GAME_SERVER_URL', 'VITE_GAME_SERVER_PORT'] as const

/** Só as variáveis pedidas, em texto: o que não é texto é ausente, como no `import.meta.env`. */
function textVariables<Env>(env: Readonly<Record<string, unknown>>, names: readonly string[]): Env {
  const picked: Record<string, string> = {}
  for (const name of names) {
    const value = env[name]
    if (typeof value === 'string') picked[name] = value
  }
  return picked as Env
}
