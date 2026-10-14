import { readFileSync } from 'node:fs'
import type { Vec3 } from '@shobu/core'
import {
  arenaCollisionBoxes,
  type CharacterState,
  createBotLocomotion,
  createCharacterState,
  createNavRoute,
  createRoutePlanner,
  IDLE_INPUT,
  type MutableMovementInput,
  type NavGraph,
  type NavLink,
  type NavNode,
  nearestNavNode,
  overlapsAny,
  parseGameplayConfig,
  planRoute,
  type StaticBox,
  standingTierOf,
  stepCharacter,
  walkRoute,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { ArenaMap } from './arenaCatalog.ts'
import { ICHIBAN_GAI_MAP } from './ichibanGaiMap.ts'
import { NEON_KAIDO_MAP } from './neonKaidoMap.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const DT_S = 1 / config.simulation.tickHz

/** O grafo de cada mapa, contra as caixas e os spawns do mesmo mapa. */
interface MapUnderTest {
  readonly name: string
  readonly boxes: readonly StaticBox[]
  readonly graph: NavGraph
  readonly spawnsM: readonly Vec3[]
}

/** A colisão inteira do mapa, arte com colisão inclusa: a platibanda e o guarda-corpo seguram o bot. */
function mapUnderTest(map: ArenaMap): MapUnderTest {
  return {
    name: map.displayName,
    boxes: arenaCollisionBoxes(map),
    graph: map.navGraph(),
    spawnsM: map.spawnPointsM,
  }
}

const MAPS: readonly MapUnderTest[] = [mapUnderTest(ICHIBAN_GAI_MAP), mapUnderTest(NEON_KAIDO_MAP)]

/** O tempo que uma ligação pode levar: a pé na corrida base, com folga para pulo e queda. */
function budgetS(link: NavLink): number {
  return link.lengthM / config.movement.runSpeedMps + 2
}

/** Um corpo parado no pé do nó, já apoiado: um tick para o `grounded` existir. */
function standingAt(map: MapUnderTest, node: NavNode): CharacterState {
  const body = createCharacterState(node.feetM, config)
  stepCharacter(body, IDLE_INPUT, map.boxes, config, DT_S)
  return body
}

function penetrates(body: CharacterState, boxes: readonly StaticBox[]): boolean {
  // um fio menor que a pele do sweep: encostar não é atravessar.
  const inset = 1e-3
  return overlapsAny(
    {
      feetX: body.position.x,
      feetY: body.position.y + inset,
      feetZ: body.position.z,
      radiusM: config.collision.capsuleRadiusM - inset,
      heightM: body.capsuleHeightM - 2 * inset,
    },
    boxes,
  )
}

interface Walk {
  readonly arrived: boolean
  readonly seconds: number
  readonly penetrated: boolean
}

/**
 * Anda **uma** ligação com as pernas do bot e a física do jogador: a rota é o
 * par de nós, com o bot já no primeiro. É exatamente o que o bot faz em jogo,
 * sem a cabeça escolhendo nada.
 */
function walkLink(map: MapUnderTest, link: NavLink): Walk {
  const body = standingAt(map, nodeOf(map, link.from))
  const locomotion = createBotLocomotion(map.graph)
  locomotion.route.nodes[0] = link.from
  locomotion.route.nodes[1] = link.to
  locomotion.route.length = 2
  locomotion.route.cursor = 1
  const input: MutableMovementInput = { ...IDLE_INPUT }
  let penetrated = false
  const ticks = Math.ceil(budgetS(link) / DT_S)
  for (let tick = 0; tick < ticks; tick += 1) {
    if (walkRoute(locomotion, body, map.graph, config.bots, input, DT_S) === 'arrived') {
      return { arrived: true, seconds: tick * DT_S, penetrated }
    }
    stepCharacter(body, input, map.boxes, config, DT_S)
    penetrated ||= penetrates(body, map.boxes)
  }
  return { arrived: false, seconds: ticks * DT_S, penetrated }
}

function nodeOf(map: MapUnderTest, index: number): NavNode {
  return map.graph.nodes[index] as NavNode
}

function linkName(map: MapUnderTest, link: NavLink): string {
  return `${nodeOf(map, link.from).name} → ${nodeOf(map, link.to).name} (${link.kind})`
}

describe.each(MAPS.map((map) => [map.name, map] as const))(
  'o grafo de navegação do %s',
  (_n, map) => {
    it('tem nós nas três camadas do gdd', () => {
      const tiers = new Set(map.graph.nodes.map((node) => standingTierOf(node.feetM.y)))
      expect(tiers).toEqual(new Set(['chão', 'meio', 'topo']))
    })

    it('usa os três tipos de ligação', () => {
      expect(new Set(map.graph.links.map((link) => link.kind))).toEqual(
        new Set(['walk', 'jump', 'drop']),
      )
    })

    /** Bot que nasce num pedaço sem volta fica rodando nele a partida inteira. */
    it('de todo nó se chega a todo nó', () => {
      const planner = createRoutePlanner(map.graph)
      const route = createNavRoute(map.graph)
      const unreachable = map.graph.nodes.flatMap((from, fromIndex) =>
        map.graph.nodes
          .map((_to, toIndex) => toIndex)
          .filter((toIndex) => !planRoute(map.graph, planner, fromIndex, toIndex, route))
          .map((toIndex) => `${from.name} → ${nodeOf(map, toIndex).name}`),
      )
      expect(unreachable).toEqual([])
    })

    /** O bot nasce num spawn e começa a rota pelo nó mais perto: ele tem que estar ali. */
    it('todo spawn tem um nó a poucos passos, na mesma camada', () => {
      const far = map.spawnsM.filter((spawn) => {
        const feet = { x: spawn[0], y: spawn[1] - config.collision.capsuleHeightM, z: spawn[2] }
        const node = nodeOf(map, nearestNavNode(map.graph, feet))
        const dx = node.feetM.x - feet.x
        const dz = node.feetM.z - feet.z
        return Math.sqrt(dx * dx + dz * dz) > 3 || Math.abs(node.feetM.y - feet.y) > 0.5
      })
      expect(far).toEqual([])
    })

    it('nenhum nó está dentro de uma caixa', () => {
      const buried = map.graph.nodes.filter((node) => penetrates(standingAt(map, node), map.boxes))
      expect(buried.map((node) => node.name)).toEqual([])
    })

    it('todo nó fica apoiado no piso em que foi escrito', () => {
      const floating = map.graph.nodes.filter((node) => {
        const body = standingAt(map, node)
        return !body.grounded || Math.abs(body.position.y - node.feetM.y) > 0.05
      })
      expect(floating.map((node) => node.name)).toEqual([])
    })
  },
)

/**
 * Cada ligação, andada pela física de verdade. É o teste que amarra o grafo à
 * arena: uma caixa movida no layout que fecha um caminho falha aqui com o
 * nome da ligação, em vez de virar bot preso na feira.
 */
describe.each(MAPS.map((map) => [map.name, map] as const))(
  'toda ligação do grafo do %s se percorre com a física do jogador',
  (_n, map) => {
    it.each(map.graph.links.map((link) => [linkName(map, link), link] as const))(
      '%s',
      (_name, link) => {
        const walk = walkLink(map, link)
        expect(walk.penetrated, 'atravessou uma caixa').toBe(false)
        expect(walk.arrived, `não chegou em ${budgetS(link).toFixed(1)} s`).toBe(true)
      },
    )
  },
)
