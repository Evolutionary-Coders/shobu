import { describe, expect, it } from 'vitest'
import { createCandidateCache } from './candidateCache.ts'

interface FakeMesh {
  layer: number
}

const isViewmodel = (mesh: FakeMesh) => mesh.layer === 1

describe('createCandidateCache', () => {
  it('filtra os membros', () => {
    const cache = createCandidateCache(isViewmodel)
    const list = cache.list([{ layer: 0 }, { layer: 1 }])
    expect(list.length).toBe(1)
  })

  it('não refaz enquanto nada muda: devolve a mesma lista', () => {
    const cache = createCandidateCache(isViewmodel)
    const meshes = [{ layer: 1 }]
    expect(cache.list(meshes)).toBe(cache.list(meshes))
  })

  it('refaz quando a cena muda de tamanho', () => {
    const cache = createCandidateCache(isViewmodel)
    const meshes = [{ layer: 0 }]
    cache.list(meshes)
    meshes.push({ layer: 1 })
    expect(cache.list(meshes).length).toBe(1)
  })

  /** Revisão do #23: a malha entrou antes de ganhar a camada, e a arma sumia para sempre. */
  it('a camada trocada depois de entrar só vale com invalidate', () => {
    const cache = createCandidateCache(isViewmodel)
    const weapon = { layer: 0 }
    const meshes = [weapon]
    expect(cache.list(meshes).length).toBe(0)
    weapon.layer = 1
    expect(cache.list(meshes).length).toBe(0)
    cache.invalidate()
    expect(cache.list(meshes).length).toBe(1)
  })
})
