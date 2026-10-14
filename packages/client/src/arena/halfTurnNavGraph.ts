import { createNavGraph, type NavGraph, type NavLinkKind, type NavLinkSpec } from '@shobu/core'
import { halfTurn, type Vec3 } from './arenaBlock.ts'

/**
 * O grafo dos bots escrito como o layout: **metade** do mapa, e a outra metade
 * é ela girada meia volta (ADR 0016). Saiu do `ichibanGaiNavGraph.ts` quando o
 * segundo mapa precisou da mesma costura.
 *
 * O que atravessa de uma metade para a outra é ligação de costura, marcada
 * com `twin`: ela liga o ponto desta metade ao **gêmeo** do outro. Os pontos
 * estão no pé, e não na convenção de olho dos spawns: é onde o bot pisa.
 */

/** Uma ligação da metade escrita. `twin` liga ao gêmeo girado de `to`, na outra metade. */
export interface HalfLink {
  readonly from: string
  readonly to: string
  readonly kind: NavLinkKind
  readonly twin?: true
}

export const walk = (from: string, to: string): HalfLink => ({ from, to, kind: 'walk' })
export const seam = (from: string, to: string): HalfLink => ({ from, to, kind: 'walk', twin: true })
export const drop = (from: string, to: string): HalfLink => ({ from, to, kind: 'drop' })
export const jump = (from: string, to: string): HalfLink => ({ from, to, kind: 'jump' })

/**
 * O grafo inteiro: cada ponto e cada ligação da metade escrita, mais o gêmeo
 * girado de cada um. Costura de um ponto com o próprio gêmeo vira **uma**
 * ligação, não duas: as duas metades descreveriam o mesmo trecho.
 *
 * ```ts
 * halfTurnNavGraph({ rua: [0, 0, 5] }, [seam('rua', 'rua')]).nodes.length // 2
 * ```
 */
export function halfTurnNavGraph(
  halfOfTheNodes: Readonly<Record<string, Vec3>>,
  halfOfTheLinks: readonly HalfLink[],
): NavGraph {
  const nodes = Object.entries(halfOfTheNodes).flatMap(([name, feetM]) => [
    { name: `${name}-a`, feetM: vectorOf(feetM) },
    { name: `${name}-b`, feetM: vectorOf(halfTurn(feetM)) },
  ])
  return createNavGraph(nodes, halfOfTheLinks.flatMap(twinLinks))
}

function twinLinks(link: HalfLink): readonly NavLinkSpec[] {
  const there = link.twin ? 'b' : 'a'
  const back = link.twin ? 'a' : 'b'
  const forward = { from: `${link.from}-a`, to: `${link.to}-${there}`, kind: link.kind }
  if (link.twin && link.from === link.to) return [forward]
  return [forward, { from: `${link.from}-b`, to: `${link.to}-${back}`, kind: link.kind }]
}

function vectorOf([x, y, z]: Vec3): { x: number; y: number; z: number } {
  return { x, y, z }
}
