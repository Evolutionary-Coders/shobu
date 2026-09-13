import { describe, expect, it } from 'vitest'
import { verticalFovRad } from './fieldOfView.ts'
import { driveFirstPersonLens, type LensRenderLoop, type LensTarget } from './firstPersonLens.ts'
import type { JackInLens } from './jackInLens.ts'

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

/** Lente de entrada de mentira: o teste decide o multiplicador. */
class FakeJackInLens implements JackInLens {
  fovScale = 1
  play(): void {}
  scale(): number {
    return this.fovScale
  }
}

const WIDE_DEG = 120
const VIEWMODEL_DEG = 65
const WIDESCREEN = 16 / 9

interface LensRig {
  readonly loop: FakeRenderLoop
  readonly world: LensTarget
  readonly viewmodel: LensTarget
  readonly jackIn: FakeJackInLens
  aspectRatio: number
  horizontalFovDeg: number
}

function mountLens(): LensRig {
  const rig: LensRig = {
    loop: new FakeRenderLoop(),
    world: { fov: 0 },
    viewmodel: { fov: 0 },
    jackIn: new FakeJackInLens(),
    aspectRatio: WIDESCREEN,
    horizontalFovDeg: WIDE_DEG,
  }
  driveFirstPersonLens(rig.loop, {
    worldCamera: rig.world,
    viewmodelCamera: rig.viewmodel,
    aspectRatio: () => rig.aspectRatio,
    horizontalFovDeg: () => rig.horizontalFovDeg,
    viewmodelFovDeg: VIEWMODEL_DEG,
    jackIn: rig.jackIn,
  })
  return rig
}

describe('driveFirstPersonLens', () => {
  it('escreve o fov vertical das duas câmeras a cada quadro', () => {
    const rig = mountLens()
    rig.loop.renderFrame()
    expect(rig.world.fov).toBeCloseTo(verticalFovRad(WIDE_DEG, WIDESCREEN))
    expect(rig.viewmodel.fov).toBeCloseTo(verticalFovRad(VIEWMODEL_DEG, WIDESCREEN))
  })

  it('multiplica o fov do mundo pela lente de entrada', () => {
    const rig = mountLens()
    rig.jackIn.fovScale = 0.82
    rig.loop.renderFrame()
    expect(rig.world.fov).toBeCloseTo(verticalFovRad(WIDE_DEG, WIDESCREEN) * 0.82)
  })

  /** A arma já está na mão de quem entra: ela não pode respirar junto com a visão. */
  it('a lente de entrada não mexe no fov do viewmodel', () => {
    const rig = mountLens()
    rig.jackIn.fovScale = 0.82
    rig.loop.renderFrame()
    expect(rig.viewmodel.fov).toBeCloseTo(verticalFovRad(VIEWMODEL_DEG, WIDESCREEN))
  })

  /** Regressão: o fov era calculado uma vez na criação, e a janela redimensionada ficava errada. */
  it('mudar a proporção da tela muda o fov no quadro seguinte', () => {
    const rig = mountLens()
    rig.loop.renderFrame()
    const wide = rig.world.fov
    rig.aspectRatio = 4 / 3
    rig.loop.renderFrame()
    expect(rig.world.fov).not.toBeCloseTo(wide)
    expect(rig.world.fov).toBeCloseTo(verticalFovRad(WIDE_DEG, 4 / 3))
  })

  it('a luneta manda no fov do mundo sem tocar no do viewmodel', () => {
    const rig = mountLens()
    rig.horizontalFovDeg = 22
    rig.loop.renderFrame()
    expect(rig.world.fov).toBeCloseTo(verticalFovRad(22, WIDESCREEN))
    expect(rig.viewmodel.fov).toBeCloseTo(verticalFovRad(VIEWMODEL_DEG, WIDESCREEN))
  })

  it('propaga a recusa de fov impossível', () => {
    const rig = mountLens()
    rig.horizontalFovDeg = 0
    expect(() => rig.loop.renderFrame()).toThrow(/horizontalFovDeg recebeu 0/)
  })
})
