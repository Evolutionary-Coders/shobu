import { readFileSync } from 'node:fs'
import {
  blockTopM,
  CROUCH_CAPSULE_RATIO,
  type GreyboxBlock,
  halfTurn,
  ICHIBAN_GAI_BLOCKOUT,
  ICHIBAN_GAI_PLAY_AREA,
  ICHIBAN_GAI_SPAWN_POINTS_M,
  isInsidePlayArea,
  maxDoubleJumpHeightM,
  maxJumpHeightM,
  NEON_KAIDO_BLOCKOUT,
  NEON_KAIDO_MID_M,
  NEON_KAIDO_PLAY_AREA,
  NEON_KAIDO_SPAWN_POINTS_M,
  NEON_KAIDO_TOP_M,
  type PlayArea,
  parseGameplayConfig,
  standingTierOf,
  type Vec3,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'

/**
 * As promessas do gdd que **todo** mapa cumpre, conferidas no layout de cada
 * um: nenhum bloco dentro de outro, meia volta exata, escada que cabe no
 * degrau, cobertura que cabe no pulo, oito spawns nas três camadas, e as três
 * camadas alcançáveis andando — mesmo sem qualquer uma das escadas.
 *
 * O que é de um mapa só (o tamanho da área, quantos lances ele tem) vem na
 * ficha dele, `LayoutUnderTest`.
 */
const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const EPSILON_M = 1e-6

interface LayoutUnderTest {
  readonly name: string
  readonly blockout: readonly GreyboxBlock[]
  readonly spawnsM: readonly Vec3[]
  readonly playArea: PlayArea
  /** As alturas de projeto do meio e do topo, em que todo piso pisável cai. */
  readonly floorsM: readonly [number, number]
  /** Quantos lances de escada o mapa tem, com os gêmeos: senão o teste passaria vazio. */
  readonly flights: number
  readonly minCovers: number
  readonly minBlockades: number
  /** O retângulo da busca de rotas a pé: x mínimo, z mínimo, largura e profundidade. */
  readonly walkGrid: readonly [number, number, number, number]
  /**
   * O lado da célula da busca: menor que o piso de um degrau, senão duas
   * células vizinhas pulam dois degraus e a escada vira parede só no teste.
   * As escadas do Neon-kaidō têm 0,4 m de piso; as do Ichiban-gai, 0,6.
   */
  readonly cellM: number
}

const LAYOUTS: readonly LayoutUnderTest[] = [
  {
    name: 'Ichiban-gai',
    blockout: ICHIBAN_GAI_BLOCKOUT,
    spawnsM: ICHIBAN_GAI_SPAWN_POINTS_M,
    playArea: ICHIBAN_GAI_PLAY_AREA,
    floorsM: [4.5, 9],
    // cinco por metade: pachinko, ponte, mercado e os dois da escada de incêndio.
    flights: 10,
    minCovers: 8,
    minBlockades: 12,
    walkGrid: [-24, -30, 48, 60],
    cellM: 0.5,
  },
  {
    name: 'Neon-kaidō',
    blockout: NEON_KAIDO_BLOCKOUT,
    spawnsM: NEON_KAIDO_SPAWN_POINTS_M,
    playArea: NEON_KAIDO_PLAY_AREA,
    floorsM: [NEON_KAIDO_MID_M, NEON_KAIDO_TOP_M],
    // quatro por metade: engawa, mezanino, fundo e terraço.
    flights: 8,
    minCovers: 10,
    minBlockades: 2,
    walkGrid: [-35, -35, 70, 70],
    cellM: 0.25,
  },
]

interface Aabb {
  readonly min: Vec3
  readonly max: Vec3
}

function aabbOf(block: GreyboxBlock): Aabb {
  const [cx, cy, cz] = block.centerM
  const [sx, sy, sz] = block.sizeM
  return {
    min: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
    max: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
  }
}

function interpenetrates(a: Aabb, b: Aabb): boolean {
  return [0, 1, 2].every(
    (axis) =>
      (a.min[axis] ?? 0) < (b.max[axis] ?? 0) - EPSILON_M &&
      (b.min[axis] ?? 0) < (a.max[axis] ?? 0) - EPSILON_M,
  )
}

function key(values: readonly number[]): string {
  return values.map((value) => (Math.abs(value) < EPSILON_M ? 0 : value).toFixed(3)).join(',')
}

const EACH = LAYOUTS.map((layout) => [layout.name, layout] as const)

describe.each(EACH)('o blockout do %s', (_name, layout) => {
  it('dá nome único a cada bloco, porque o nome é o que se procura no blender', () => {
    const names = layout.blockout.map((block) => block.name)
    expect(new Set(names).size).toBe(names.length)
  })

  /**
   * Bloco dentro de bloco é face escondida que o bake ilumina à toa e
   * z-fighting onde as faces coincidem. Encostar pode; entrar não.
   */
  it('nenhum bloco entra em outro', () => {
    const boxes = layout.blockout.map((block) => ({ block, aabb: aabbOf(block) }))
    const collisions = boxes.flatMap((first, index) =>
      boxes
        .slice(index + 1)
        .filter((second) => interpenetrates(first.aabb, second.aabb))
        .map((second) => `${first.block.name} × ${second.block.name}`),
    )
    expect(collisions).toEqual([])
  })

  /** Num free-for-all nenhum spawn pode nascer do lado melhor do mapa. */
  it('é igual a si mesmo girado meia volta', () => {
    const shapes = layout.blockout.map((b) => key([...b.centerM, ...b.sizeM])).sort()
    const turned = layout.blockout.map((b) => key([...halfTurn(b.centerM), ...b.sizeM])).sort()
    expect(turned).toEqual(shapes)
  })

  it('só pisa nas três alturas de projeto, e em todas elas', () => {
    const walkable = layout.blockout.filter((b) => ['building', 'walkway'].includes(b.layer))
    const floors = new Set(walkable.map((block) => blockTopM(block)))
    expect([...floors].sort((a, b) => a - b)).toEqual([...layout.floorsM])
    expect(new Set([...floors, 0].map(standingTierOf))).toEqual(new Set(['chão', 'meio', 'topo']))
  })

  /** Prédio de fora da área e torre do paredão não se sobem: é cidade, não caminho (ADR 0011). */
  it('todo prédio do bairro e toda torre é mais alto que o pulo duplo com folga de um andar', () => {
    const tall = layout.blockout.filter((b) => ['outskirt', 'tower'].includes(b.layer))
    expect(tall.length).toBeGreaterThanOrEqual(6)
    for (const block of tall) {
      expect(blockTopM(block), block.name).toBeGreaterThan(maxDoubleJumpHeightM(config) + 3)
    }
  })

  /** O telhado da torre é fora da área: senão seria uma quarta camada que vê o mapa todo. */
  it('o topo de toda torre fica acima do teto da partida', () => {
    for (const block of layout.blockout.filter((b) => b.layer === 'tower')) {
      const roof = { x: block.centerM[0], y: blockTopM(block), z: block.centerM[2] }
      expect(isInsidePlayArea(layout.playArea, roof), block.name).toBe(false)
    }
  })
})

/**
 * O degrau é a única subida sem pulo. Degrau acima de `stepHeightM` é parede:
 * o jogador para nele e conclui que a escada é cenário.
 */
describe.each(EACH)('as escadas do %s cabem no degrau do controlador', (_name, layout) => {
  const flights = new Map<string, number[]>()
  for (const block of layout.blockout.filter((b) => b.layer === 'stair')) {
    const flight = block.name.replace(/-\d+-([ab])$/, '-$1')
    if (flight === block.name) continue
    flights.set(flight, [...(flights.get(flight) ?? []), blockTopM(block)])
  }

  it('encontra os lances, senão o teste passaria vazio', () => {
    expect(flights.size).toBe(layout.flights)
  })

  it('todo degrau sobe no máximo stepHeightM acima do anterior', () => {
    for (const [flight, tops] of flights) {
      const sorted = [...tops].sort((a, b) => a - b)
      const rises = sorted.map((top, index) => top - (sorted[index - 1] ?? top - 0.3))
      const worst = Math.max(...rises)
      expect(worst, `${flight} sobe ${worst.toFixed(3)} num degrau`).toBeLessThanOrEqual(
        config.collision.stepHeightM,
      )
    }
  })
})

function onDesignFloor(layout: LayoutUnderTest, block: GreyboxBlock): boolean {
  const bottomM = blockTopM(block) - block.sizeM[1]
  return [0, ...layout.floorsM].some((floorM) => Math.abs(floorM - bottomM) < EPSILON_M)
}

/**
 * A cobertura tem que caber no que a movimentação alcança. As do greybox antigo
 * nasceram com 3 m, e o pulo duplo chega a 2,68: eram **impossíveis** de subir,
 * não difíceis — e o jogador não distingue as duas coisas.
 */
describe.each(EACH)('as coberturas do %s cabem no envelope de pulo', (_name, layout) => {
  const covers = layout.blockout.filter((block) => block.layer === 'cover')

  it('encontra as coberturas, senão o teste passaria vazio', () => {
    expect(covers.length).toBeGreaterThanOrEqual(layout.minCovers)
  })

  it('toda cobertura está apoiada num piso de projeto', () => {
    for (const cover of covers) expect(onDesignFloor(layout, cover), cover.name).toBe(true)
  })

  it('toda cobertura esconde um jogador em pé, sobe com pulo duplo e não com um só', () => {
    const single = maxJumpHeightM(config)
    const double = maxDoubleJumpHeightM(config)
    for (const cover of covers) {
      const height = cover.sizeM[1]
      expect(height, cover.name).toBeGreaterThanOrEqual(config.collision.capsuleHeightM)
      expect(height, cover.name).toBeGreaterThan(single)
      expect(height, cover.name).toBeLessThanOrEqual(double)
    }
  })
})

/**
 * A cobertura baixa é outra promessa: esconde quem se agacha atrás dela, não
 * esconde quem fica de pé, e sobe com um pulo só. Se ela crescer além do pulo
 * simples vira parede; se encolher abaixo do agachado, vira enfeite.
 */
describe.each(EACH)('as coberturas baixas do %s cabem no envelope do agachado', (_n, layout) => {
  const lows = layout.blockout.filter((block) => block.layer === 'lowCover')
  const crouched = config.collision.capsuleHeightM * CROUCH_CAPSULE_RATIO

  it('encontra as coberturas baixas, senão o teste passaria vazio', () => {
    expect(lows.length).toBeGreaterThanOrEqual(2)
  })

  it('toda cobertura baixa esconde o agachado e não o que está em pé', () => {
    for (const low of lows) {
      expect(low.sizeM[1], low.name).toBeGreaterThanOrEqual(crouched)
      expect(low.sizeM[1], low.name).toBeLessThan(config.collision.capsuleHeightM)
    }
  })

  it('toda cobertura baixa sobe com um pulo simples', () => {
    for (const low of lows) {
      expect(low.sizeM[1], low.name).toBeLessThanOrEqual(maxJumpHeightM(config))
    }
  })

  it('toda cobertura baixa está num piso de projeto', () => {
    for (const low of lows) expect(onDesignFloor(layout, low), low.name).toBe(true)
  })
})

describe.each(EACH)('os spawns do %s', (_name, layout) => {
  it('são oito, dois por jogador da partida de quatro', () => {
    expect(layout.spawnsM).toHaveLength(config.match.playersPerRoom * 2)
  })

  it('se espalham pelas três camadas', () => {
    const tiers = layout.spawnsM.map(([, eyeY]) =>
      standingTierOf(eyeY - config.collision.capsuleHeightM),
    )
    expect(new Set(tiers)).toEqual(new Set(['chão', 'meio', 'topo']))
  })

  it('ninguém nasce dentro de um bloco', () => {
    for (const [x, eyeY, z] of layout.spawnsM) {
      const feetY = eyeY - config.collision.capsuleHeightM
      const radius = config.collision.capsuleRadiusM
      const body: Aabb = {
        min: [x - radius, feetY, z - radius],
        max: [x + radius, eyeY, z + radius],
      }
      const inside = layout.blockout.filter((block) => interpenetrates(body, aabbOf(block)))
      expect(
        inside.map((block) => block.name),
        `spawn [${x}, ${eyeY}, ${z}]`,
      ).toEqual([])
    }
  })

  /**
   * Spawn fora da área seria nascer já contando para morrer: o jogador reaparece
   * e, cinco segundos depois, reaparece de novo, para sempre.
   */
  it('todo spawn está dentro da área de jogo', () => {
    for (const [x, eyeY, z] of layout.spawnsM) {
      const feetM = { x, y: eyeY - config.collision.capsuleHeightM, z }
      expect(isInsidePlayArea(layout.playArea, feetM), `spawn [${x}, ${eyeY}, ${z}]`).toBe(true)
    }
  })
})

/** Bloqueio dentro da área seria obra no meio do jogo; ele fecha o mapa, não a arena. */
describe.each(EACH)('a área de jogo do %s', (_name, layout) => {
  it('fica inteira longe dos bloqueios do fim do mapa', () => {
    const blockades = layout.blockout.filter((block) => block.layer === 'blockade')
    expect(blockades.length).toBeGreaterThanOrEqual(layout.minBlockades)
    for (const block of blockades) {
      const inside =
        Math.abs(block.centerM[0]) < layout.playArea.maxX &&
        Math.abs(block.centerM[2]) < layout.playArea.maxZ
      expect(inside, block.name).toBe(false)
    }
  })
})

describe('ICHIBAN_GAI_PLAY_AREA', () => {
  it('tem 64 × 76 m: o miolo da arena e 8 m de rua em volta', () => {
    expect(ICHIBAN_GAI_PLAY_AREA).toEqual({ minX: -32, maxX: 32, minZ: -38, maxZ: 38 })
  })
})

describe('NEON_KAIDO_PLAY_AREA', () => {
  it('tem 70 × 70 m e o teto três metros acima do terraço', () => {
    expect(NEON_KAIDO_PLAY_AREA).toEqual({
      minX: -35,
      maxX: 35,
      minZ: -35,
      maxZ: 35,
      maxFeetY: NEON_KAIDO_TOP_M + 3,
    })
  })
})

/**
 * Navegação em grade de meio metro: de cada ponto em que se fica de pé, anda-se
 * para o vizinho se ele estiver no máximo um degrau acima — ou em qualquer
 * altura abaixo, porque não há dano de queda. **Sem pulo nenhum**: é a prova
 * de que as rotas do gdd existem sem depender de pulo duplo nem de gancho.
 */
interface Stand {
  readonly column: number
  readonly row: number
  readonly floorM: number
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

interface WalkGrid {
  readonly layout: LayoutUnderTest
  readonly columns: number
  readonly rows: number
  readonly cells: readonly CellNeighbourhood[]
}

interface CellNeighbourhood {
  readonly x: number
  readonly z: number
  readonly near: readonly { readonly block: GreyboxBlock; readonly aabb: Aabb }[]
}

/**
 * Quais blocos tocam cada célula (com a folga do raio do jogador) é calculado
 * **uma vez** por mapa; cada variante sem uma escada só tira dessa lista os
 * blocos que não tem. Refazer a busca a cada variante passava de 5 s com o
 * layout dobrado pelas lajes do bairro (06/10).
 */
function walkGridOf(layout: LayoutUnderTest): WalkGrid {
  const [x0, z0, width, depth] = layout.walkGrid
  const cell = layout.cellM
  const columns = Math.round(width / cell)
  const rows = Math.round(depth / cell)
  const radius = config.collision.capsuleRadiusM
  const blocks = layout.blockout.map((block) => ({ block, aabb: aabbOf(block) }))
  const cells = Array.from({ length: columns * rows }, (_, index) => {
    const x = x0 + ((index % columns) + 0.5) * cell
    const z = z0 + (Math.floor(index / columns) + 0.5) * cell
    const near = blocks.filter(
      ({ aabb: b }) =>
        b.min[0] - radius < x &&
        x < b.max[0] + radius &&
        b.min[2] - radius < z &&
        z < b.max[2] + radius,
    )
    return { x, z, near }
  })
  return { layout, columns, rows, cells }
}

/** Os pisos em que se fica de pé em cada célula, para o mapa ou o mapa sem alguma escada. */
function floorGrid(
  grid: WalkGrid,
  blockout: readonly GreyboxBlock[],
): readonly (readonly number[])[] {
  const present = new Set(blockout)
  return grid.cells.map(({ x, z, near }) =>
    standableFloors(
      near.filter((entry) => present.has(entry.block)).map((entry) => entry.aabb),
      x,
      z,
    ),
  )
}

function standableFloors(near: readonly Aabb[], x: number, z: number): readonly number[] {
  const radius = config.collision.capsuleRadiusM
  const height = config.collision.capsuleHeightM
  const floors = near
    .filter((b) => b.min[0] <= x && x <= b.max[0] && b.min[2] <= z && z <= b.max[2])
    .map((b) => b.max[1])
  return floors.filter((floorM) => {
    // o corpo começa um degrau acima do pé: o que é mais baixo que isso o
    // controlador sobe sozinho (`sweepCharacter.ts`), e no meio de uma escada o
    // próximo degrau está sempre dentro do raio do jogador.
    const body: Aabb = {
      min: [x - radius, floorM + config.collision.stepHeightM, z - radius],
      max: [x + radius, floorM + height, z + radius],
    }
    return !near.some((b) => interpenetrates(body, b))
  })
}

/** Os pontos de pé vizinhos de `stand` alcançáveis andando: um degrau acima, ou qualquer queda. */
function stepsFrom(
  grid: WalkGrid,
  floors: readonly (readonly number[])[],
  stand: Stand,
): readonly Stand[] {
  return NEIGHBOURS.flatMap(([dc, dr]) => {
    const column = stand.column + dc
    const row = stand.row + dr
    if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return []
    return (floors[row * grid.columns + column] ?? [])
      .filter((floorM) => floorM <= stand.floorM + config.collision.stepHeightM + EPSILON_M)
      .map((floorM) => ({ column, row, floorM }))
  })
}

function reachableTiers(
  grid: WalkGrid,
  blockout: readonly GreyboxBlock[],
  start: Vec3,
): ReadonlySet<string> {
  const floors = floorGrid(grid, blockout)
  const [x0, z0] = grid.layout.walkGrid
  const first: Stand = {
    column: Math.floor((start[0] - x0) / grid.layout.cellM),
    row: Math.floor((start[2] - z0) / grid.layout.cellM),
    floorM: start[1] - config.collision.capsuleHeightM,
  }
  const queue: Stand[] = [first]
  const seen = new Set([key([first.column, first.row, first.floorM])])
  const tiers = new Set<string>()
  // índice em vez de `shift`, que é O(n) por passo numa fila de milhares.
  for (let head = 0, stand = queue[0]; stand; head += 1, stand = queue[head]) {
    tiers.add(standingTierOf(stand.floorM))
    const fresh = stepsFrom(grid, floors, stand).filter((next) => {
      const id = key([next.column, next.row, next.floorM])
      return !seen.has(id) && Boolean(seen.add(id))
    })
    queue.push(...fresh)
  }
  return tiers
}

describe.each(EACH)('as rotas do gdd no %s existem sem pulo', (_name, layout) => {
  const groundSpawn = layout.spawnsM[0]
  if (!groundSpawn) throw new Error(`${layout.name} não tem spawn 0`)
  const grid = walkGridOf(layout)

  it('do spawn 0 se chega andando às três camadas', () => {
    expect(reachableTiers(grid, layout.blockout, groundSpawn)).toEqual(
      new Set(['chão', 'meio', 'topo']),
    )
  })

  /**
   * "Pelo menos duas rotas de subida por camada" (gdd), medido do jeito que
   * importa: tirar **qualquer** escada inteira do mapa e as três camadas
   * continuarem alcançáveis. Uma rota só seria um ponto de camping garantido.
   *
   * Uma busca no grid inteiro por escada removida: o limite explícito é o
   * desta busca, não o padrão de 5 s pensado para teste de função.
   */
  it('continua chegando às três camadas sem qualquer uma das escadas', () => {
    const stairBlocks = layout.blockout.filter((b) => b.layer === 'stair')
    const flights = new Set(stairBlocks.map((b) => b.name.replace(/-\d+-([ab])$/, '-$1')))
    for (const flight of flights) {
      const without = layout.blockout.filter(
        (b) => b.name.replace(/-\d+-([ab])$/, '-$1') !== flight,
      )
      expect(reachableTiers(grid, without, groundSpawn), `sem ${flight}`).toEqual(
        new Set(['chão', 'meio', 'topo']),
      )
    }
  }, 30_000)
})
