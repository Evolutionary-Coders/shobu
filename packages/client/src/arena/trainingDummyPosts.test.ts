import { raycastBoxes } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { blockoutToStaticBoxes } from './collisionBoxes.ts'
import { GREYBOX_BLOCKOUT, GREYBOX_SPAWN_POINTS_M } from './greyboxBlockout.ts'
import { TRAINING_DUMMY_SPAWN_INDEXES, trainingDummyPostsM } from './trainingDummyPosts.ts'

const boxes = blockoutToStaticBoxes(GREYBOX_BLOCKOUT)
const ALL_POSTS = trainingDummyPostsM(TRAINING_DUMMY_SPAWN_INDEXES.length + 1)

function distanceM(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): number {
  const [dx, dy, dz] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** O tiro sai do olho e mira o **tronco** do boneco, meio metro abaixo do olho dele. */
function hasClearShot(
  eye: readonly [number, number, number],
  post: readonly [number, number, number],
): boolean {
  const chest: readonly [number, number, number] = [post[0], post[1] - 0.5, post[2]]
  const range = distanceM(eye, chest)
  if (range < 0.1) return true
  const direction = {
    x: (chest[0] - eye[0]) / range,
    y: (chest[1] - eye[1]) / range,
    z: (chest[2] - eye[2]) / range,
  }
  const wall = raycastBoxes({ x: eye[0], y: eye[1], z: eye[2] }, direction, boxes, range + 1)
  return wall === undefined || wall >= range - 0.05
}

describe('trainingDummyPostsM', () => {
  it('devolve os postes pedidos, do mais perto do spawn 0 ao mais longe', () => {
    expect(trainingDummyPostsM(2)).toHaveLength(2)
    expect(trainingDummyPostsM(0)).toEqual([])
  })

  it('recusa mais bonecos que postes, dizendo quantos há', () => {
    expect(() => trainingDummyPostsM(99)).toThrow(/esperado inteiro de 0 a 6/)
  })

  /**
   * A regressão de level design: um boneco enfiado atrás de um bloco não serve
   * de alvo, e ninguém descobre isso a olho no dia em que alguém mover uma
   * plataforma.
   */
  it('todo poste tem linha de tiro limpa de algum spawn', () => {
    for (const post of ALL_POSTS) {
      const seen = GREYBOX_SPAWN_POINTS_M.some((spawn) => hasClearShot(spawn, post))
      expect({ post, seen }).toEqual({ post, seen: true })
    }
  })

  /** Os cinco últimos são referência, não cópia: mover o spawn move o boneco. */
  it('os postes de spawn são os pontos de spawn de verdade', () => {
    for (const [order, index] of TRAINING_DUMMY_SPAWN_INDEXES.entries()) {
      expect(ALL_POSTS[order + 1]).toBe(GREYBOX_SPAWN_POINTS_M[index])
    }
  })

  it('os postes cobrem as três faixas de distância do modelo de simulação', () => {
    const spawn = GREYBOX_SPAWN_POINTS_M[0]
    if (!spawn) throw new Error('a arena não tem spawn 0')
    const ranges = ALL_POSTS.map((post) => distanceM(spawn, post))
    expect(ranges.some((range) => range < 15)).toBe(true)
    expect(ranges.some((range) => range >= 15 && range < 40)).toBe(true)
    expect(ranges.some((range) => range >= 40)).toBe(true)
  })

  it('nenhum poste repete outro', () => {
    expect(new Set(ALL_POSTS.map((post) => post.join(','))).size).toBe(ALL_POSTS.length)
  })
})

/**
 * A invariante que substituiu o `throw` de dentro do módulo: os índices são
 * constantes, então "todo poste aponta para um spawn que existe" é fato
 * estático. Encolher `GREYBOX_SPAWN_POINTS_M` no level design quebra aqui, no
 * CI, e não em silêncio na frente do jogador.
 */
describe('TRAINING_DUMMY_SPAWN_INDEXES', () => {
  it('todo índice aponta para um spawn existente do greybox', () => {
    for (const index of TRAINING_DUMMY_SPAWN_INDEXES) {
      expect(GREYBOX_SPAWN_POINTS_M[index], `spawn ${index} não existe`).toBeDefined()
    }
  })

  it('não repete spawn: dois bonecos no mesmo poste seria um alvo perdido', () => {
    expect(new Set(TRAINING_DUMMY_SPAWN_INDEXES).size).toBe(TRAINING_DUMMY_SPAWN_INDEXES.length)
  })
})
