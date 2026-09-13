import { type ElementQuery, requireElement } from './requireElement.ts'
import type { ScopeTick } from './scopeTicks.ts'

/**
 * Monta no boot os nós que o visor desenha em quantidade: as marcas de bala e
 * a escada da luneta.
 *
 * **No boot e não no primeiro tiro**, pelo mesmo motivo do `mountJackInLayer`:
 * algumas dezenas de nós são baratos, mas não no quadro em que o jogador
 * acabou de ganhar o controle.
 */
export interface ArenaHudLayerOptions {
  readonly pipCount: number
  readonly ladder: readonly ScopeTick[]
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Geometria das marcas de bala dentro do viewBox de 1000x120 do peitoril.
 *
 * À **esquerda** do centro, e não centradas: o corpo da arma sai pelo canto
 * inferior direito, e marca de bala atrás da coronha não se lê.
 */
const PIP_WIDTH = 14
const PIP_HEIGHT = 26
const PIP_GAP = 10
const PIP_BASELINE_Y = 54
const PIP_CENTER_X = 250

export function mountArenaHudLayer(root: ElementQuery, options: ArenaHudLayerOptions): void {
  fillPips(requireElement<SVGGElement>(root, '#ammo-pips'), options.pipCount)
  fillLadder(requireElement<SVGGElement>(root, '#scope-ladder'), options.ladder)
}

/**
 * `createElementNS` e não `createElement`: um `<rect>` criado como elemento
 * html é um desconhecido que não desenha nada e **não dá erro nenhum** — é a
 * armadilha clássica de montar svg por javascript.
 */
function fillPips(group: SVGGElement, count: number): void {
  const document = group.ownerDocument
  const totalWidth = count * PIP_WIDTH + (count - 1) * PIP_GAP
  const startX = PIP_CENTER_X - totalWidth / 2
  const pips = Array.from({ length: count }, (_, index) => {
    const pip = document.createElementNS(SVG_NS, 'rect')
    pip.setAttribute('class', 'ammo-pip')
    pip.setAttribute('x', `${startX + index * (PIP_WIDTH + PIP_GAP)}`)
    pip.setAttribute('y', `${PIP_BASELINE_Y}`)
    pip.setAttribute('width', `${PIP_WIDTH}`)
    pip.setAttribute('height', `${PIP_HEIGHT}`)
    return pip
  })
  group.replaceChildren(...pips)
}

function fillLadder(group: SVGGElement, ladder: readonly ScopeTick[]): void {
  const document = group.ownerDocument
  const nodes = ladder.flatMap((tick) => {
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('class', 'ladder-tick')
    line.setAttribute('x1', `${500 - tick.halfWidth}`)
    line.setAttribute('x2', `${500 + tick.halfWidth}`)
    line.setAttribute('y1', `${tick.y}`)
    line.setAttribute('y2', `${tick.y}`)
    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('class', 'ladder-label')
    label.setAttribute('x', `${500 + tick.halfWidth + 12}`)
    label.setAttribute('y', `${tick.y + 8}`)
    label.textContent = tick.label
    return [line, label]
  })
  group.replaceChildren(...nodes)
}
