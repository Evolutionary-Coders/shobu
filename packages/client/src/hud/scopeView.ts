/**
 * O sobreposto da luneta na tela. Implementado pelo hud em dom e css (ADR
 * 0001) e **injetado** no renderer: quem sabe *quando* é o renderer, que tem o
 * relógio da transição; quem sabe *como* é o hud.
 *
 * Os dois métodos são idempotentes: o renderer chama só na mudança, mas não
 * promete isso.
 */
export interface ScopeView {
  open(): void
  close(): void
}

/** Luneta que não faz nada. É o que o renderer usa enquanto o hud não existe. */
export function createSilentScopeView(): ScopeView {
  return { open: () => {}, close: () => {} }
}
