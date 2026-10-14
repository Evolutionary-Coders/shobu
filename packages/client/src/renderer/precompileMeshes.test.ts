import { describe, expect, it } from 'vitest'
import { type CompilableMesh, type FrameSource, precompileMeshes } from './precompileMeshes.ts'

/** Material de mentira: anota quem compilou, e pode recusar. */
class FakeMaterial {
  compiled = 0

  constructor(private readonly fails: boolean) {}

  forceCompilationAsync(): Promise<void> {
    this.compiled += 1
    return this.fails ? Promise.reject(new Error('shader')) : Promise.resolve()
  }
}

/** Cena de mentira: o quadro seguinte chega na hora em que é pedido. */
class FakeFrames implements FrameSource {
  waited = 0
  readonly onAfterRenderObservable = {
    addOnce: (callback: () => void): void => {
      this.waited += 1
      callback()
    },
  }
}

describe('precompileMeshes', () => {
  it('compila cada material e espera um quadro', async () => {
    const material = new FakeMaterial(false)
    const frames = new FakeFrames()
    const meshes: CompilableMesh[] = [{ material }, { material: null }]
    await precompileMeshes(frames, meshes)
    expect(material.compiled).toBe(1)
    expect(frames.waited).toBe(1)
  })

  it('a compilação recusada não derruba quem espera', async () => {
    const frames = new FakeFrames()
    await expect(
      precompileMeshes(frames, [{ material: new FakeMaterial(true) }]),
    ).resolves.toBeUndefined()
  })
})
