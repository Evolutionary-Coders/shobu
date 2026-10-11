import { describe, expect, it } from 'vitest'
import { type ElementQuery, requireElement } from './requireElement.ts'

const OVERLAY = { tagName: 'SECTION' } as unknown as Element

/** Documento falso: o teste roda em node, sem dom (adr 0001). */
class FakeDocument implements ElementQuery {
  constructor(private readonly bySelector: ReadonlyMap<string, Element>) {}

  querySelector<E extends Element>(selectors: string): E | null {
    return (this.bySelector.get(selectors) as E | undefined) ?? null
  }
}

describe('requireElement', () => {
  it('devolve o elemento que o seletor acha', () => {
    const document = new FakeDocument(new Map([['#boot-overlay', OVERLAY]]))
    expect(requireElement(document, '#boot-overlay')).toBe(OVERLAY)
  })

  /**
   * A mensagem carrega o seletor porque é o dado que resolve o problema: quem
   * lê o erro precisa saber qual elemento faltou no index.html, não que algo
   * faltou.
   */
  it('quebra citando o seletor que não achou nada', () => {
    const document = new FakeDocument(new Map())
    expect(() => requireElement(document, '#jack-rain')).toThrow(/#jack-rain/)
  })
})
