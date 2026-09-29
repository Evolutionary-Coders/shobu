import { readFileSync } from 'node:fs'
import {
  CROUCH_CAPSULE_RATIO,
  isInsidePlayArea,
  maxDoubleJumpHeightM,
  maxJumpHeightM,
  parseGameplayConfig,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { blockTopM, type GreyboxBlock, halfTurn, standingTierOf, type Vec3 } from './arenaBlock.ts'
import {
  ICHIBAN_GAI_BLOCKOUT,
  ICHIBAN_GAI_PLAY_AREA,
  ICHIBAN_GAI_SPAWN_POINTS_M,
} from './ichibanGai.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const EPSILON_M = 1e-6

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

describe('ICHIBAN_GAI_BLOCKOUT', () => {
  it('dá nome único a cada bloco, porque o nome é o que se procura no blender', () => {
    const names = ICHIBAN_GAI_BLOCKOUT.map((block) => block.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('tem piso, casco, prédio, passarela, escada e cobertura', () => {
    const layers = new Set(ICHIBAN_GAI_BLOCKOUT.map((block) => block.layer))
    expect([...layers].sort()).toEqual(
      ['barrier', 'building', 'cover', 'floor', 'lowCover', 'stair', 'walkway'].sort(),
    )
  })

  /**
   * Bloco dentro de bloco é face escondida que o bake ilumina à toa e
   * z-fighting onde as faces coincidem. Encostar pode; entrar não.
   */
  it('nenhum bloco entra em outro', () => {
    const boxes = ICHIBAN_GAI_BLOCKOUT.map((block) => ({ block, aabb: aabbOf(block) }))
    const collisions = boxes.flatMap((first, index) =>
      boxes
        .slice(index + 1)
        .filter((second) => interpenetrates(first.aabb, second.aabb))
        .map((second) => `${first.block.name} × ${second.block.name}`),
    )
    expect(collisions).toEqual([])
  })

  /** Num free-for-all nenhum spawn pode nascer do lado melhor do mapa. */
  it('é igual a si mesma girada meia volta', () => {
    const shapes = ICHIBAN_GAI_BLOCKOUT.map((b) => key([...b.centerM, ...b.sizeM])).sort()
    const turned = ICHIBAN_GAI_BLOCKOUT.map((b) => key([...halfTurn(b.centerM), ...b.sizeM])).sort()
    expect(turned).toEqual(shapes)
  })

  it('só pisa nas três alturas de projeto, e em todas elas', () => {
    const walkable = ICHIBAN_GAI_BLOCKOUT.filter((b) => ['building', 'walkway'].includes(b.layer))
    const floors = new Set(walkable.map((block) => blockTopM(block)))
    expect([...floors].sort((a, b) => a - b)).toEqual([4.5, 9])
    expect(new Set([...floors, 0].map(standingTierOf))).toEqual(new Set(['chão', 'meio', 'topo']))
  })
})

/**
 * O degrau é a única subida sem pulo. Degrau acima de `stepHeightM` é parede:
 * o jogador para nele e conclui que a escada é cenário.
 */
describe('as escadas cabem no degrau do controlador', () => {
  const flights = new Map<string, number[]>()
  for (const block of ICHIBAN_GAI_BLOCKOUT.filter((b) => b.layer === 'stair')) {
    const flight = block.name.replace(/-\d+-([ab])$/, '-$1')
    if (flight === block.name) continue
    flights.set(flight, [...(flights.get(flight) ?? []), blockTopM(block)])
  }

  /** Cinco por metade: pachinko, ponte, mercado e os dois da escada de incêndio. */
  it('encontra os lances, senão o teste passaria vazio', () => {
    expect(flights.size).toBe(10)
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

/**
 * A cobertura tem que caber no que a movimentação alcança. As do greybox antigo
 * nasceram com 3 m, e o pulo duplo chega a 2,68: eram **impossíveis** de subir,
 * não difíceis — e o jogador não distingue as duas coisas.
 */
describe('as coberturas cabem no envelope de pulo', () => {
  const covers = ICHIBAN_GAI_BLOCKOUT.filter((block) => block.layer === 'cover')

  function heightAboveSupportM(cover: GreyboxBlock): number {
    return cover.sizeM[1]
  }

  it('encontra as coberturas, senão o teste passaria vazio', () => {
    expect(covers.length).toBeGreaterThanOrEqual(8)
  })

  it('toda cobertura está apoiada num piso de projeto', () => {
    for (const cover of covers) {
      const bottomM = blockTopM(cover) - cover.sizeM[1]
      const onDesignFloor = [0, 4.5, 9].some((floorM) => Math.abs(floorM - bottomM) < EPSILON_M)
      expect(onDesignFloor, `${cover.name} apoiada em ${bottomM}`).toBe(true)
    }
  })

  it('toda cobertura esconde um jogador em pé, sobe com pulo duplo e não com um só', () => {
    const single = maxJumpHeightM(config)
    const double = maxDoubleJumpHeightM(config)
    for (const cover of covers) {
      const height = heightAboveSupportM(cover)
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
describe('as coberturas baixas cabem no envelope de quem se agacha', () => {
  const lows = ICHIBAN_GAI_BLOCKOUT.filter((block) => block.layer === 'lowCover')
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

  it('toda cobertura baixa está no chão', () => {
    for (const low of lows) {
      expect(blockTopM(low) - low.sizeM[1], low.name).toBeCloseTo(0)
    }
  })
})

describe('ICHIBAN_GAI_SPAWN_POINTS_M', () => {
  it('tem oito pontos, dois por jogador da partida de quatro', () => {
    expect(ICHIBAN_GAI_SPAWN_POINTS_M).toHaveLength(config.match.playersPerRoom * 2)
  })

  it('espalha os spawns pelas três camadas', () => {
    const tiers = ICHIBAN_GAI_SPAWN_POINTS_M.map(([, eyeY]) =>
      standingTierOf(eyeY - config.collision.capsuleHeightM),
    )
    expect(new Set(tiers)).toEqual(new Set(['chão', 'meio', 'topo']))
  })

  it('ninguém nasce dentro de um bloco', () => {
    for (const [x, eyeY, z] of ICHIBAN_GAI_SPAWN_POINTS_M) {
      const feetY = eyeY - config.collision.capsuleHeightM
      const radius = config.collision.capsuleRadiusM
      const body: Aabb = {
        min: [x - radius, feetY, z - radius],
        max: [x + radius, eyeY, z + radius],
      }
      const inside = ICHIBAN_GAI_BLOCKOUT.filter((block) => interpenetrates(body, aabbOf(block)))
      expect(
        inside.map((block) => block.name),
        `spawn [${x}, ${eyeY}, ${z}]`,
      ).toEqual([])
    }
  })
})

/**
 * Navegação em grade de meio metro: de cada ponto em que se fica de pé, anda-se
 * para o vizinho se ele estiver no máximo um degrau acima — ou em qualquer
 * altura abaixo, porque não há dano de queda. **Sem pulo nenhum**: é a prova
 * de que as rotas do gdd existem sem depender de pulo duplo nem de gancho.
 */
const CELL_M = 0.5

interface Stand {
  readonly column: number
  readonly row: number
  readonly floorM: number
}

const COLUMNS = Math.round(48 / CELL_M)
const ROWS = Math.round(60 / CELL_M)
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

function cellCentre(column: number, row: number): readonly [number, number] {
  return [-24 + (column + 0.5) * CELL_M, -30 + (row + 0.5) * CELL_M]
}

/**
 * Os pisos em que se fica de pé em cada célula, calculados uma vez por
 * blockout. Só os blocos que tocam a célula (com a folga do raio do jogador)
 * entram na conta — é o que mantém o teste rápido com quinze variantes.
 */
function floorGrid(blockout: readonly GreyboxBlock[]): readonly (readonly number[])[] {
  const blocks = blockout.map(aabbOf)
  const radius = config.collision.capsuleRadiusM
  return Array.from({ length: COLUMNS * ROWS }, (_, cell) => {
    const [x, z] = cellCentre(cell % COLUMNS, Math.floor(cell / COLUMNS))
    const near = blocks.filter(
      (b) =>
        b.min[0] - radius < x &&
        x < b.max[0] + radius &&
        b.min[2] - radius < z &&
        z < b.max[2] + radius,
    )
    return standableFloors(near, x, z)
  })
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
function stepsFrom(grid: readonly (readonly number[])[], stand: Stand): readonly Stand[] {
  return NEIGHBOURS.flatMap(([dc, dr]) => {
    const column = stand.column + dc
    const row = stand.row + dr
    if (column < 0 || row < 0 || column >= COLUMNS || row >= ROWS) return []
    return (grid[row * COLUMNS + column] ?? [])
      .filter((floorM) => floorM <= stand.floorM + config.collision.stepHeightM + EPSILON_M)
      .map((floorM) => ({ column, row, floorM }))
  })
}

function reachableTiers(blockout: readonly GreyboxBlock[], start: Vec3): ReadonlySet<string> {
  const grid = floorGrid(blockout)
  const first: Stand = {
    column: Math.floor((start[0] + 24) / CELL_M),
    row: Math.floor((start[2] + 30) / CELL_M),
    floorM: start[1] - config.collision.capsuleHeightM,
  }
  const queue: Stand[] = [first]
  const seen = new Set([key([first.column, first.row, first.floorM])])
  const tiers = new Set<string>()
  for (let stand = queue.shift(); stand; stand = queue.shift()) {
    tiers.add(standingTierOf(stand.floorM))
    const fresh = stepsFrom(grid, stand).filter((next) => {
      const id = key([next.column, next.row, next.floorM])
      return !seen.has(id) && Boolean(seen.add(id))
    })
    queue.push(...fresh)
  }
  return tiers
}

describe('as rotas do gdd existem sem pulo', () => {
  const groundSpawn = ICHIBAN_GAI_SPAWN_POINTS_M[0]
  if (!groundSpawn) throw new Error('a arena não tem spawn 0')

  it('do spawn 0 se chega andando às três camadas', () => {
    expect(reachableTiers(ICHIBAN_GAI_BLOCKOUT, groundSpawn)).toEqual(
      new Set(['chão', 'meio', 'topo']),
    )
  })

  /**
   * "Pelo menos duas rotas de subida por camada" (gdd), medido do jeito que
   * importa: tirar **qualquer** escada inteira do mapa e as três camadas
   * continuarem alcançáveis. Uma rota só seria um ponto de camping garantido.
   */
  it('continua chegando às três camadas sem qualquer uma das escadas', () => {
    const stairBlocks = ICHIBAN_GAI_BLOCKOUT.filter((b) => b.layer === 'stair')
    const flights = new Set(stairBlocks.map((b) => b.name.replace(/-\d+-([ab])$/, '-$1')))
    for (const flight of flights) {
      const without = ICHIBAN_GAI_BLOCKOUT.filter(
        (b) => b.name.replace(/-\d+-([ab])$/, '-$1') !== flight,
      )
      expect(reachableTiers(without, groundSpawn), `sem ${flight}`).toEqual(
        new Set(['chão', 'meio', 'topo']),
      )
    }
  })
})

/**
 * Spawn fora da área seria nascer já contando para morrer: o jogador reaparece
 * e, cinco segundos depois, reaparece de novo, para sempre.
 */
describe('ICHIBAN_GAI_PLAY_AREA', () => {
  it('é o piso de 48 × 60 m', () => {
    expect(ICHIBAN_GAI_PLAY_AREA).toEqual({ minX: -24, maxX: 24, minZ: -30, maxZ: 30 })
  })

  it('todo spawn está dentro dela', () => {
    for (const [x, eyeY, z] of ICHIBAN_GAI_SPAWN_POINTS_M) {
      const feetM = { x, y: eyeY - config.collision.capsuleHeightM, z }
      const where = `spawn [${x}, ${eyeY}, ${z}]`
      expect(isInsidePlayArea(ICHIBAN_GAI_PLAY_AREA, feetM), where).toBe(true)
    }
  })
})
