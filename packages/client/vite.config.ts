import { fileURLToPath } from 'node:url'
import { gameplayConfigUrl } from '@shobu/core'
import { defineConfig } from 'vite'
import { clientEnvCheck } from './vite/clientEnvCheckPlugin.ts'
import { gameplayConfigPlugin } from './vite/gameplayConfigPlugin.ts'
import { revalidateOptimizedDeps } from './vite/revalidateOptimizedDeps.ts'

// o tamanho do bundle é a primeira medição do projeto (nfr.md). `npm run
// measure:bundle` lê o manifest que esta configuração produz.
export default defineConfig({
  // o `.env` é um só, na raiz, o mesmo que o servidor lê (`.env.example`).
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  plugins: [
    // o mesmo `GAMEPLAY_CONFIG` do servidor, resolvido contra a mesma raiz.
    gameplayConfigPlugin(gameplayConfigUrl(process.env, new URL('../../', import.meta.url))),
    revalidateOptimizedDeps(),
    // o endereço do servidor errado falha aqui, citando o valor, e não no navegador.
    clientEnvCheck(),
  ],
  /**
   * O que `gltfPipeline.ts` carrega por **import dinâmico**, pré-empacotado
   * junto com o resto.
   *
   * Sem isto o vite só descobre esses módulos na primeira carga de um glb,
   * re-otimiza as dependências e serve o loader de um passe novo enquanto o
   * `@babylonjs/core` já carregado veio do passe anterior. São **duas cópias do
   * babylon** na mesma página: o `AnimationGroup` que o loader constrói é
   * iniciado pelo protótipo da outra cópia, o `_animatables` interno pertence a
   * outra identidade de classe, e a carga morre em
   * `Cannot set properties of undefined (setting 'weight')` — todo avatar e o
   * viewmodel some, sem nada no lugar.
   *
   * Só aparece com o cache de dependências frio, que é o estado de quem acaba
   * de clonar ou de trocar de branch. Em produção o rollup empacota tudo num
   * passe só e o defeito não existe.
   */
  optimizeDeps: {
    include: [
      '@babylonjs/loaders/glTF/2.0',
      '@babylonjs/core/Shaders/postprocess.vertex',
      '@babylonjs/core/Shaders/rgbdDecode.fragment',
    ],
  },
  build: {
    target: 'es2022',
    manifest: true,
    sourcemap: true,
    reportCompressedSize: true,
  },
})
