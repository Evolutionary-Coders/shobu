import { defineConfig } from 'vite'
import { gameplayConfigPlugin } from './vite/gameplayConfigPlugin.ts'

// o tamanho do bundle é a primeira medição do projeto (nfr.md). `npm run
// measure:bundle` lê o manifest que esta configuração produz.
export default defineConfig({
  plugins: [gameplayConfigPlugin(new URL('../../config/gameplay.json', import.meta.url))],
  build: {
    target: 'es2022',
    manifest: true,
    sourcemap: true,
    reportCompressedSize: true,
  },
})
