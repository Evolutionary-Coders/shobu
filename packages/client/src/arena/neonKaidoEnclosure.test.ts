import { describe, expect, it } from 'vitest'
import type { GreyboxBlock } from './arenaBlock.ts'
import { NEON_KAIDO_BLOCKOUT, NEON_KAIDO_PLAY_AREA } from './neonKaido.ts'

/**
 * O bairro fecha a área de jogo: de qualquer ponto dela, em qualquer altura até
 * o olho de quem está no teto, todo olhar na horizontal bate num prédio antes
 * do fim do mundo — ou sai pela boca do Kaidō, onde a arte continua a rua
 * (`canyon_beyond` em `scripts/blender/neon/neon_far.py`).
 *
 * É a metade do layout da reclamação de 12/10 ("lugares que não tinham paredes
 * e dava para ver o limbo"): uma fresta entre dois blocos do bairro, ou um
 * prédio baixo demais na borda, abre vista para fora da cidade vestida. A outra
 * metade — o piso e a fachada que a arte desenha sobre estas caixas — é dos
 * testes de `scripts/blender/neon/test_neon_floorplan.py`.
 */
const OPAQUE = new Set<GreyboxBlock['layer']>(['building', 'tower', 'outskirt'])
const EYE_M = 1.8
const CEILING_EYE_M = (NEON_KAIDO_PLAY_AREA.maxFeetY ?? 0) + EYE_M
const HEIGHTS_M = [EYE_M, 6 + EYE_M, 13 + EYE_M, CEILING_EYE_M]
const HEADINGS = 48
const GRID_M = 2.5

interface Box {
  readonly lo: readonly [number, number, number]
  readonly hi: readonly [number, number, number]
}

function boxOf(block: GreyboxBlock): Box {
  const [cx, cy, cz] = block.centerM
  const [sx, sy, sz] = block.sizeM
  return {
    lo: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
    hi: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
  }
}

const barriers = NEON_KAIDO_BLOCKOUT.filter((block) => block.layer === 'barrier').map(boxOf)
const WORLD_X = Math.max(...barriers.map((box) => box.hi[0])) - 1
const WORLD_Z = Math.max(...barriers.map((box) => box.hi[2])) - 1
/** As bocas de rua: o vão em x de cada tapume, que é onde a arte segue a rua. */
const MOUTHS = NEON_KAIDO_BLOCKOUT.filter((block) => block.name.includes('tapume')).map(boxOf)

function inside(box: Box, point: readonly number[], padM = 0): boolean {
  return ([0, 1, 2] as const).every(
    (axis) =>
      box.lo[axis] - padM < (point[axis] as number) &&
      (point[axis] as number) < box.hi[axis] + padM,
  )
}

/** A distância até a face do retângulo `box` (em x, z) que o raio horizontal cruza primeiro. */
function hitDistance(box: Box, origin: readonly number[], dx: number, dz: number): number {
  let near = 0
  let far = Number.POSITIVE_INFINITY
  for (const [axis, d] of [
    [0, dx],
    [2, dz],
  ] as const) {
    const o = origin[axis] as number
    if (Math.abs(d) < 1e-9) {
      if (o < box.lo[axis] || o > box.hi[axis]) return Number.POSITIVE_INFINITY
      continue
    }
    const a = (box.lo[axis] - o) / d
    const b = (box.hi[axis] - o) / d
    near = Math.max(near, Math.min(a, b))
    far = Math.min(far, Math.max(a, b))
  }
  return near <= far ? near : Number.POSITIVE_INFINITY
}

/** Onde o raio sai do retângulo do mundo. */
function worldExit(origin: readonly number[], dx: number, dz: number): [number, number] {
  const tx =
    Math.abs(dx) < 1e-9
      ? Number.POSITIVE_INFINITY
      : (Math.sign(dx) * WORLD_X - (origin[0] as number)) / dx
  const tz =
    Math.abs(dz) < 1e-9
      ? Number.POSITIVE_INFINITY
      : (Math.sign(dz) * WORLD_Z - (origin[2] as number)) / dz
  const t = Math.min(tx, tz)
  return [(origin[0] as number) + dx * t, (origin[2] as number) + dz * t]
}

function throughMouth([x, z]: [number, number]): boolean {
  return (
    Math.abs(Math.abs(z) - WORLD_Z) < 1e-6 &&
    MOUTHS.some((mouth) => mouth.lo[0] - 1e-6 <= x && x <= mouth.hi[0] + 1e-6)
  )
}

/** Os olhos da varredura: uma grade na área de jogo, nas alturas de `HEIGHTS_M`, fora dos blocos. */
function eyes(solid: readonly Box[]): number[][] {
  const { minX, maxX, minZ, maxZ } = NEON_KAIDO_PLAY_AREA
  const found: number[][] = []
  for (let x = minX + GRID_M / 2; x < maxX; x += GRID_M) {
    for (let z = minZ + GRID_M / 2; z < maxZ; z += GRID_M) {
      found.push(...HEIGHTS_M.map((y) => [x, y, z]))
    }
  }
  return found.filter((eye) => !solid.some((box) => inside(box, eye, 0.3)))
}

/** Os rumos de um olho que não batem em nada opaco e não saem pela boca. */
function leaksFrom(eye: readonly number[], opaque: readonly Box[]): string[] {
  const walls = opaque.filter(
    (box) => box.lo[1] <= (eye[1] as number) && (eye[1] as number) <= box.hi[1],
  )
  const leaks: string[] = []
  for (let heading = 0; heading < HEADINGS; heading += 1) {
    const angle = (2 * Math.PI * heading) / HEADINGS
    const dx = Math.sin(angle)
    const dz = Math.cos(angle)
    if (walls.some((box) => Number.isFinite(hitDistance(box, eye, dx, dz)))) continue
    const exit = worldExit(eye, dx, dz)
    if (!throughMouth(exit)) leaks.push(`${eye} rumo ${heading} sai em ${exit}`)
  }
  return leaks
}

/** Os olhares que escapam do bairro `blockout`: de onde, para que rumo, e onde saem do mundo. */
function horizonLeaks(blockout: readonly GreyboxBlock[]): string[] {
  const opaque = blockout.filter((block) => OPAQUE.has(block.layer)).map(boxOf)
  const solid = blockout.filter((block) => block.layer !== 'floor').map(boxOf)
  return eyes(solid).flatMap((eye) => leaksFrom(eye, opaque))
}

describe('o bairro em volta do Neon-kaidō', () => {
  it('fecha toda vista horizontal da área de jogo, do chão ao olho no teto, fora a boca do Kaidō', () => {
    expect(horizonLeaks(NEON_KAIDO_BLOCKOUT)).toEqual([])
  })

  it('acusa a fresta quando falta um quarteirão do bairro', () => {
    const withoutWest = NEON_KAIDO_BLOCKOUT.filter((block) => block.name !== 'bairro-oeste-a')
    expect(horizonLeaks(withoutWest).length).toBeGreaterThan(0)
  })

  it('tem bloco opaco mais alto que o olho no teto em toda a borda do mundo, fora a boca', () => {
    const opaque = NEON_KAIDO_BLOCKOUT.filter((block) => OPAQUE.has(block.layer)).map(boxOf)
    const tooLow = opaque.filter(
      (box) =>
        (Math.abs(box.lo[0]) >= WORLD_X - 1e-6 || Math.abs(box.hi[0]) >= WORLD_X - 1e-6) &&
        box.hi[1] < CEILING_EYE_M,
    )
    expect(tooLow).toEqual([])
  })

  it('só deixa sair pela boca do Kaidō, que existe dos dois lados', () => {
    expect(MOUTHS.length).toBe(2)
    expect(throughMouth([0, WORLD_Z])).toBe(true)
    expect(throughMouth([0, -WORLD_Z])).toBe(true)
    expect(throughMouth([20, WORLD_Z])).toBe(false)
  })
})
