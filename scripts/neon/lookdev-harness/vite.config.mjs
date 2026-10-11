import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * O harness de captura do look-dev (`scripts/neon/capture-lookdev.mjs`): uma
 * página que carrega o recorte exportado pelo blender com o **mesmo** código do
 * jogo — `loadArenaScenery`, a névoa, o céu e o halo de verdade —, para que a
 * imagem do babylon diga como o look-dev fica no jogo, e não no blender.
 *
 * O `publicDir` é `assets/work/neon/jogo`, onde `neon_export.py` grava a arte em
 * `assets/arena/` — o `ARENA_SCENERY_DIR` que o cliente procura.
 */
const root = fileURLToPath(new URL('.', import.meta.url))
const repo = fileURLToPath(new URL('../../../', import.meta.url))

export default defineConfig({
  root,
  publicDir: fileURLToPath(new URL('../../../assets/work/neon/jogo', import.meta.url)),
  server: { port: 5199, strictPort: true, fs: { allow: [repo] } },
  optimizeDeps: {
    include: [
      '@babylonjs/loaders/glTF/2.0',
      '@babylonjs/core/Shaders/postprocess.vertex',
      '@babylonjs/core/Shaders/rgbdDecode.fragment',
    ],
  },
})
