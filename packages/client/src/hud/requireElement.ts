/**
 * Busca obrigatória de elemento no hud. O hud é dom escrito à mão no
 * `index.html`, então um seletor que não acha nada é erro de programação, não
 * estado possível: falhar aqui, com o seletor na mensagem, custa menos que um
 * `null` viajando três chamadas até virar "cannot read property of null".
 *
 * O parâmetro é esta interface e não `ParentNode` porque `ParentNode` arrasta o
 * dom inteiro para dentro do teste, e os testes rodam em node (adr 0001).
 * `document` satisfaz a interface, e um duplo de teste também.
 */
export interface ElementQuery {
  querySelector<E extends Element>(selectors: string): E | null
}

/**
 * ```ts
 * const overlay = requireElement<HTMLElement>(document, '#boot-overlay')
 * ```
 */
export function requireElement<T extends Element>(root: ElementQuery, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (element) return element
  throw new Error(`querySelector('${selector}') não achou nada; esperado um elemento no index.html`)
}
