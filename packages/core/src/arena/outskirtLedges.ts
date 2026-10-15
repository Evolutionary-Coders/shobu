import { blockBetween, blockTopM, type GreyboxBlock, type Vec3 } from './arenaBlock.ts'

/**
 * Os toldos de loja e as escadas de incêndio dos prédios do bairro, **com
 * colisão** (06/10).
 *
 * Até aqui eles eram só pele do blender (`arena_city.py`): o jogador subia no
 * toldo com o pulo duplo, ou chegava na escada pelo gancho, e atravessava os
 * dois. Agora a posição de cada um nasce aqui, vira bloco do layout — o mesmo
 * no cliente e no servidor — e o blender só os veste. O que se vê bloquear é o
 * que bloqueia.
 *
 * Só nas faces que dão para a rua: a face colada no vizinho ou na borda do
 * mundo não tem calçada para pôr toldo, nem ninguém para vê-la.
 */

/** O térreo de loja e o pé-direito dos andares de cima: os mesmos de `arena_city.py`. */
export const GROUND_FLOOR_M = 3.4
export const STOREY_M = 3.2
const AWNING_LOW_M = 2.6
const AWNING_HIGH_M = 3.0
const AWNING_DEPTH_M = 1.1
const AWNING_INSET_M = 0.3
export const ESCAPE_WIDTH_M = 4.2
export const ESCAPE_DEPTH_M = 1.2
const PLATFORM_THICKNESS_M = 0.08
/** Os degraus do lance, do jeito que o molde do blender os desenha. */
const TREADS = 9
const TREADS_PER_BOX = 3
const TREAD_HALF_WIDTH_M = 0.2
const TREAD_THICKNESS_M = 0.04
const TREAD_PROUD_M: readonly [number, number] = [0.35, 0.95]
/** Fachada curta ou prédio baixo não ganha escada: não cabe um lance. */
const ESCAPE_MIN_FACE_M = 8
const ESCAPE_MIN_TOP_M = 10

/** Uma face vertical de um bloco: o eixo da normal e o sentido dela. */
interface Facade {
  readonly block: GreyboxBlock
  readonly normalAxis: 0 | 2
  readonly sign: 1 | -1
}

/**
 * Os toldos e as escadas de incêndio de cada prédio do bairro em `outskirts`,
 * só nas faces abertas para a rua. `solid` é tudo contra o que eles não podem
 * entrar — e é por ele que se sabe se a face está aberta.
 *
 * ```ts
 * outskirtLedges(halfOfTheMap().filter(isOutskirt), fullMap, world)
 * ```
 */
export function outskirtLedges(
  outskirts: readonly GreyboxBlock[],
  solid: readonly GreyboxBlock[],
  world: { readonly halfWidthM: number; readonly halfDepthM: number },
): readonly GreyboxBlock[] {
  const ledges = outskirts.flatMap((block) => {
    const open = facadesOf(block).filter((facade) => isOpen(facade, solid, world))
    const front = open.filter(isEscapeFace)
    return [...open.flatMap(awning), ...front.flatMap(fireEscape)]
  })
  return ledges.filter((ledge) => !solid.some((block) => interpenetrates(ledge, block)))
}

function facadesOf(block: GreyboxBlock): readonly Facade[] {
  return [
    { block, normalAxis: 0, sign: 1 },
    { block, normalAxis: 0, sign: -1 },
    { block, normalAxis: 2, sign: 1 },
    { block, normalAxis: 2, sign: -1 },
  ]
}

/** Um metro de altura, 0,6 m à frente do meio da face: no mundo e fora de todo bloco. */
function isOpen(
  facade: Facade,
  solid: readonly GreyboxBlock[],
  world: { readonly halfWidthM: number; readonly halfDepthM: number },
): boolean {
  const probe = [...facade.block.centerM] as [number, number, number]
  probe[facade.normalAxis] = planeOf(facade) + facade.sign * 0.6
  probe[1] = 1
  const inWorld = Math.abs(probe[0]) < world.halfWidthM && Math.abs(probe[2]) < world.halfDepthM
  return inWorld && !solid.some((block) => block !== facade.block && contains(block, probe))
}

/**
 * A escada vai na face virada para o centro do mapa e na oposta, como em
 * `arena_city.py`, e só se ela for comprida e o prédio alto o bastante.
 */
function isEscapeFace(facade: Facade): boolean {
  if (runLengthOf(facade) < ESCAPE_MIN_FACE_M) return false
  if (blockTopM(facade.block) < ESCAPE_MIN_TOP_M) return false
  return facade.normalAxis === frontOf(facade.block).normalAxis
}

/** A face cuja normal aponta mais para a origem; a oposta divide o eixo com ela. */
function frontOf(block: GreyboxBlock): Facade {
  return facadesOf(block).reduce((best, facade) =>
    towardOrigin(facade) > towardOrigin(best) ? facade : best,
  )
}

function towardOrigin(facade: Facade): number {
  return -facade.sign * facade.block.centerM[facade.normalAxis]
}

function awning(facade: Facade): readonly GreyboxBlock[] {
  const [start, end] = runOf(facade)
  return [
    ledgeBox(
      facade,
      `toldo-${facadeName(facade)}`,
      [start + AWNING_INSET_M, end - AWNING_INSET_M],
      [AWNING_LOW_M, AWNING_HIGH_M],
      [0, AWNING_DEPTH_M],
    ),
  ]
}

/** Um patamar por andar, do primeiro acima da loja até 1,2 m abaixo do topo, e o lance de cada um. */
function fireEscape(facade: Facade): readonly GreyboxBlock[] {
  const [start, end] = runOf(facade)
  const centre = (start + end) / 2
  const pieces: GreyboxBlock[] = []
  let storey = GROUND_FLOOR_M + STOREY_M
  for (let index = 0; storey <= blockTopM(facade.block) - 1.2; index += 1) {
    pieces.push(platform(facade, centre, storey, index), ...flight(facade, centre, storey, index))
    storey += STOREY_M
  }
  return pieces
}

function platform(facade: Facade, centre: number, heightM: number, index: number): GreyboxBlock {
  return ledgeBox(
    facade,
    `patamar-${facadeName(facade)}-${index}`,
    [centre - ESCAPE_WIDTH_M / 2, centre + ESCAPE_WIDTH_M / 2],
    [heightM - PLATFORM_THICKNESS_M, heightM],
    [0, ESCAPE_DEPTH_M],
  )
}

/**
 * O lance que desce deste patamar para o de baixo, em diagonal na fachada.
 * Andar sim, andar não, ele troca de lado — o zigue-zague que o molde
 * `escape_template` desenha com o mesmo `flip`.
 *
 * Os nove degraus do molde viram três caixas, uma por trio, cada uma do pé do
 * degrau mais baixo ao topo do mais alto. Um bloco por degrau levava o layout
 * de 267 para 851 blocos, e o lance nem se sobe: a cabeça bate no patamar de
 * cima. O que ele precisa é não ser atravessado.
 */
function flight(facade: Facade, centre: number, heightM: number, index: number): GreyboxBlock[] {
  const flipped = index % 2 === 1
  const start = flipped ? centre - ESCAPE_WIDTH_M / 2 + 0.2 : centre + ESCAPE_WIDTH_M / 2 - 0.2
  const tread = (step: number) => ({
    along: start + ((flipped ? 1 : -1) * ESCAPE_WIDTH_M * 0.8 * step) / TREADS,
    top: heightM - (STOREY_M * (step + 1)) / (TREADS + 1),
  })
  return Array.from({ length: TREADS / TREADS_PER_BOX }, (_, group) => {
    const first = tread(group * TREADS_PER_BOX)
    const last = tread(group * TREADS_PER_BOX + TREADS_PER_BOX - 1)
    return ledgeBox(
      facade,
      `degrau-${facadeName(facade)}-${index}-${group}`,
      [
        Math.min(first.along, last.along) - TREAD_HALF_WIDTH_M,
        Math.max(first.along, last.along) + TREAD_HALF_WIDTH_M,
      ],
      [last.top - TREAD_THICKNESS_M, first.top],
      TREAD_PROUD_M,
    )
  })
}

/** Uma caixa colada na face: `along` no eixo da face, `proud` para fora dela. */
function ledgeBox(
  facade: Facade,
  name: string,
  along: readonly [number, number],
  height: readonly [number, number],
  proud: readonly [number, number],
): GreyboxBlock {
  const runAxis = facade.normalAxis === 0 ? 2 : 0
  const plane = planeOf(facade)
  const low: [number, number, number] = [0, height[0], 0]
  const high: [number, number, number] = [0, height[1], 0]
  low[runAxis] = along[0]
  high[runAxis] = along[1]
  low[facade.normalAxis] = plane + facade.sign * proud[0]
  high[facade.normalAxis] = plane + facade.sign * proud[1]
  return blockBetween(name, 'ledge', facade.block.zone, low, high)
}

function facadeName(facade: Facade): string {
  return `${facade.block.name}-${facade.normalAxis === 0 ? 'x' : 'z'}${facade.sign > 0 ? '+' : '-'}`
}

function planeOf(facade: Facade): number {
  const { centerM, sizeM } = facade.block
  return centerM[facade.normalAxis] + (facade.sign * sizeM[facade.normalAxis]) / 2
}

function runOf(facade: Facade): readonly [number, number] {
  const runAxis = facade.normalAxis === 0 ? 2 : 0
  const { centerM, sizeM } = facade.block
  return [centerM[runAxis] - sizeM[runAxis] / 2, centerM[runAxis] + sizeM[runAxis] / 2]
}

function runLengthOf(facade: Facade): number {
  const [start, end] = runOf(facade)
  return end - start
}

const AXES = [0, 1, 2] as const

function contains(block: GreyboxBlock, point: Vec3): boolean {
  return AXES.every((axis) => Math.abs(point[axis] - block.centerM[axis]) < block.sizeM[axis] / 2)
}

function interpenetrates(first: GreyboxBlock, second: GreyboxBlock): boolean {
  return AXES.every(
    (axis) =>
      Math.abs(first.centerM[axis] - second.centerM[axis]) <
      (first.sizeM[axis] + second.sizeM[axis]) / 2 - 1e-6,
  )
}
