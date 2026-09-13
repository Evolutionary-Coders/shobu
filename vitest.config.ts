import { defineConfig } from 'vitest/config'

/**
 * Os adapters de i/o, e a única coisa que fica fora da conta de cobertura.
 * Cada arquivo aqui fala com a engine, com o dom ou com a rede, e por decisão
 * da adr 0001 nenhum teste abre navegador para exercitá-lo.
 *
 * Esta lista é o inventário do que aquela decisão deixa sem verificação, e
 * entrar nela é o custo — visível no diff — de escrever lógica dentro de um
 * adapter em vez de fora dele. `coverageExclusions.test.ts` é a tranca: só
 * aceita aqui arquivo que de fato toca engine, dom ou rede.
 */
export const IO_ADAPTERS: readonly string[] = [
  'packages/client/src/main.ts',
  'packages/client/src/arena/buildGreyboxArena.ts',
  'packages/client/src/config/fetchGameplayConfig.ts',
  'packages/client/src/hud/bootOverlay.ts',
  'packages/client/src/hud/domLineSink.ts',
  'packages/client/src/hud/jackInLayer.ts',
  'packages/client/src/renderer/arenaLighting.ts',
  'packages/client/src/renderer/babylonArenaRenderer.ts',
  'packages/client/src/renderer/competitorAnimator.ts',
  'packages/client/src/renderer/driveCameraFromCharacter.ts',
  'packages/client/src/renderer/firstPersonViewer.ts',
  'packages/client/src/renderer/flattenPbrMaterial.ts',
  'packages/client/src/renderer/gltfPipeline.ts',
  'packages/client/src/renderer/greyboxMaterials.ts',
  'packages/client/src/renderer/loadCompetitorAvatar.ts',
  'packages/client/src/renderer/loadSniperViewmodel.ts',
]

// headless por decisão: nenhum teste abre navegador (adr 0001).
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    // teste que só passa na ordem em que foi escrito não é teste independente.
    sequence: { shuffle: { files: true, tests: true } },
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', ...IO_ADAPTERS],
      reporter: ['text-summary'],
      // 100% no que roda headless: é a forma verificável de "toda função nova
      // ganha teste". Baixar este número exige justificar no diff por quê.
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
