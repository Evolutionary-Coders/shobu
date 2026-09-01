import { defineConfig } from 'vitest/config'

// headless por decisão: nenhum teste abre navegador (adr 0001).
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
})
