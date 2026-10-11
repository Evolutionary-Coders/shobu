import { describe, expect, it } from 'vitest'
import { createSilentScopeView } from './scopeView.ts'

/**
 * A luneta muda é o que o renderer usa enquanto o hud não existe. Ela vale
 * como teste porque é a prova de que o renderer **não** precisa do hud para
 * rodar: quebrar isso quebraria o jogo sem hud, que é o modo em que o
 * `babylonArenaRenderer` roda quando `options.hud` vem vazio.
 */
describe('createSilentScopeView', () => {
  it('abre e fecha sem exigir dom nenhum', () => {
    const view = createSilentScopeView()
    expect(() => {
      view.open()
      view.close()
    }).not.toThrow()
  })

  it('é idempotente: abrir duas vezes não muda nada', () => {
    const view = createSilentScopeView()
    expect(() => {
      view.open()
      view.open()
      view.close()
      view.close()
    }).not.toThrow()
  })

  it('cumpre o contrato inteiro do ScopeView', () => {
    const view = createSilentScopeView()
    expect(typeof view.open).toBe('function')
    expect(typeof view.close).toBe('function')
  })
})
