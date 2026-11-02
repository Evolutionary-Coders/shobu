import type { Plugin } from 'vite'
import { checkClientEnv } from '../src/net/clientEnvCheck.ts'

/**
 * Falha o build (e o `vite` de dev) quando uma variável `VITE_*` que o
 * cliente lê está errada, citando o valor (`checkClientEnv`). Sem isto, o
 * bundle saía e só quebrava no navegador de quem joga.
 */
export function clientEnvCheck(): Plugin {
  return {
    name: 'shobu:client-env-check',
    configResolved(config) {
      checkClientEnv(config.env)
    },
  }
}
