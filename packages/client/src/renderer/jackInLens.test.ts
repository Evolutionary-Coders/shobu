import { describe, expect, it } from 'vitest'
import {
  createJackInLens,
  LENS_CLOSED_SCALE,
  LENS_OPEN_MS,
  type LensRenderLoop,
  lensFovScale,
} from './jackInLens.ts'

/** Laço de render de mentira: guarda os passos e roda todos quando mandado. */
class FakeRenderLoop implements LensRenderLoop {
  private readonly steps: Array<() => void> = []
  readonly onBeforeRenderObservable = {
    add: (step: () => void): void => {
      this.steps.push(step)
    },
  }
  renderFrame(): void {
    for (const step of this.steps) step()
  }
}

/** Relógio de mentira: o teste decide que hora é. */
class FakeClock {
  nowMs = 0
  readonly now = (): number => this.nowMs
}

describe('lensFovScale', () => {
  it('começa fechada e termina no fov base', () => {
    expect(lensFovScale(0)).toBe(LENS_CLOSED_SCALE)
    expect(lensFovScale(LENS_OPEN_MS)).toBe(1)
  })

  it('só abre, nunca fecha de volta', () => {
    let previous = lensFovScale(0)
    for (let elapsed = 50; elapsed <= LENS_OPEN_MS; elapsed += 50) {
      const current = lensFovScale(elapsed)
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  /** Abrir rápido e assentar devagar: na metade do tempo já passou da metade. */
  it('abre com saída suave', () => {
    expect(lensFovScale(LENS_OPEN_MS / 2)).toBeGreaterThan((LENS_CLOSED_SCALE + 1) / 2)
  })

  it('não passa do fov base nem volta antes do zero', () => {
    expect(lensFovScale(LENS_OPEN_MS * 3)).toBe(1)
    expect(lensFovScale(-200)).toBe(LENS_CLOSED_SCALE)
  })

  it('recusa instante que não é número', () => {
    expect(() => lensFovScale(Number.NaN)).toThrow(/elapsedMs recebeu NaN/)
  })
})

describe('createJackInLens', () => {
  it('não mexe na câmera antes de tocar', () => {
    const loop = new FakeRenderLoop()
    const camera = { fov: 1.2 }
    createJackInLens(loop, camera, new FakeClock().now)
    loop.renderFrame()
    expect(camera.fov).toBe(1.2)
  })

  it('fecha a lente ao tocar e abre até o fov base', () => {
    const loop = new FakeRenderLoop()
    const clock = new FakeClock()
    const camera = { fov: 1.2 }
    const lens = createJackInLens(loop, camera, clock.now)
    lens.play()
    loop.renderFrame()
    expect(camera.fov).toBeCloseTo(1.2 * LENS_CLOSED_SCALE)
    clock.nowMs = LENS_OPEN_MS
    loop.renderFrame()
    expect(camera.fov).toBeCloseTo(1.2)
  })

  /**
   * Um esc e uma reentrada no meio da abertura: a base tem que continuar sendo
   * o fov original, senão cada reentrada afunila a visão um pouco mais.
   */
  it('reentrar no meio da abertura parte sempre do mesmo fov base', () => {
    const loop = new FakeRenderLoop()
    const clock = new FakeClock()
    const camera = { fov: 1.2 }
    const lens = createJackInLens(loop, camera, clock.now)
    lens.play()
    clock.nowMs = 200
    loop.renderFrame()
    lens.play()
    loop.renderFrame()
    expect(camera.fov).toBeCloseTo(1.2 * LENS_CLOSED_SCALE)
    clock.nowMs = 200 + LENS_OPEN_MS
    loop.renderFrame()
    expect(camera.fov).toBeCloseTo(1.2)
  })

  it('para de escrever na câmera depois de aberta', () => {
    const loop = new FakeRenderLoop()
    const clock = new FakeClock()
    const camera = { fov: 1.2 }
    createJackInLens(loop, camera, clock.now).play()
    clock.nowMs = LENS_OPEN_MS
    loop.renderFrame()
    camera.fov = 0.5
    clock.nowMs = LENS_OPEN_MS + 100
    loop.renderFrame()
    expect(camera.fov).toBe(0.5)
  })
})
