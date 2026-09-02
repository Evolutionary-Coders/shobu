import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

/**
 * Serve o `config/gameplay.json` da raiz do repositório como `/gameplay.json`,
 * em dev e no build. A ADR 0005 exige **um** arquivo lido em tempo de execução
 * pelo cliente, pelo servidor e pelas ferramentas de level design — copiá-lo
 * para dentro de `public/` criaria a segunda cópia que a decisão evita.
 */
export function gameplayConfigPlugin(sourceUrl: URL): Plugin {
  const servedPath = '/gameplay.json'
  return {
    name: 'shobu:gameplay-config',
    configureServer(server) {
      server.middlewares.use(servedPath, (_request, response) => {
        response.setHeader('content-type', 'application/json')
        response.end(readFileSync(sourceUrl, 'utf8'))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: servedPath.slice(1),
        source: readFileSync(sourceUrl, 'utf8'),
      })
    },
  }
}
