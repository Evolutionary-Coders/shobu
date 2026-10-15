import type { Plugin } from 'vite'

const OPTIMIZED_DEPS_PATH = '/node_modules/.vite/deps/'

/**
 * Em dev, o vite serve as dependências pré-empacotadas com
 * `Cache-Control: max-age=31536000,immutable`, e os imports dinâmicos de dentro
 * delas (os `*.pure-*.js` do loader de glTF do babylon) nem levam o `?v=`.
 * Quando o vite refaz o pré-empacotamento, a url de um arquivo pode sair igual
 * com conteúdo diferente, e o navegador, que não revalida o que é imutável,
 * mistura cópias velhas com novas: um chunk velho pede chunks que não existem
 * mais (504 "Outdated Optimize Dep"), o loader de glTF morre, e avatar, bonecos
 * e arma somem, com `Cannot set properties of undefined (setting 'weight')` ou
 * `Failed to fetch dynamically imported module` no console.
 *
 * Com `no-cache`, o navegador revalida cada arquivo pelo ETag que o vite já
 * manda, e em localhost a resposta 304 custa quase nada. Só vale no servidor
 * de dev: o build de produção empacota tudo num passe e não tem este cache.
 */
export function revalidateOptimizedDeps(): Plugin {
  return {
    name: 'shobu:revalidate-optimized-deps',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith(OPTIMIZED_DEPS_PATH)) {
          const setHeader = response.setHeader.bind(response)
          response.setHeader = (name, value) =>
            setHeader(name, name.toLowerCase() === 'cache-control' ? 'no-cache' : value)
        }
        next()
      })
    },
  }
}
