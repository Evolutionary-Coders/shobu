import type { KillWeapon } from '@shobu/core'
import { type KillIconId, killIcon } from './killIcons.ts'
import type { KillTag } from './killTags.ts'

/**
 * Os ícones de kill (`killIcons.ts`) em `<svg>`. **Monta cada ícone uma vez
 * por documento e clona**: o killfeed, a tela de morte e o cartão de abate
 * pedem ícone por kill, e clonar um nó pronto é mais barato que reconstruir os
 * caminhos — e não lê nem escreve layout.
 *
 * O ícone é imagem com nome (`role="img"` mais `aria-label` e `<title>`): o
 * killfeed é `aria-live`, e sem o nome a linha seria lida como "RAIDEN ONRYO".
 */
const SVG_NS = 'http://www.w3.org/2000/svg'

const templates = new WeakMap<Document, Map<KillIconId, SVGSVGElement>>()

/**
 * ```ts
 * line.append(killIconNode(line, 'sniper'))
 * ```
 */
export function killIconNode(owner: HTMLElement, id: KillIconId): SVGSVGElement {
  const document = owner.ownerDocument
  let cache = templates.get(document)
  if (!cache) {
    cache = new Map()
    templates.set(document, cache)
  }
  let template = cache.get(id)
  if (!template) {
    template = buildIcon(document, id)
    cache.set(id, template)
  }
  return template.cloneNode(true) as SVGSVGElement
}

/**
 * A arma e as marcas, na ordem da linha, dentro de `into`.
 *
 * ```ts
 * appendKillIcons(how, 'sniper', ['headshot', 'scoped'])
 * ```
 */
export function appendKillIcons(
  into: HTMLElement,
  weapon: KillWeapon,
  tags: readonly KillTag[],
): void {
  into.append(killIconNode(into, weapon), ...tags.map((tag) => killIconNode(into, tag)))
}

function buildIcon(document: Document, id: KillIconId): SVGSVGElement {
  const icon = killIcon(id)
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${icon.width} ${icon.height}`)
  svg.setAttribute('width', `${icon.width}`)
  svg.setAttribute('height', `${icon.height}`)
  svg.setAttribute('class', `kill-icon kill-icon--${id}`)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', icon.label)
  const title = document.createElementNS(SVG_NS, 'title')
  title.textContent = icon.label
  svg.append(title)
  for (const path of icon.paths) {
    const node = document.createElementNS(SVG_NS, 'path')
    node.setAttribute('d', path.d)
    node.setAttribute('class', `kill-icon-${path.paint}`)
    svg.append(node)
  }
  return svg
}
