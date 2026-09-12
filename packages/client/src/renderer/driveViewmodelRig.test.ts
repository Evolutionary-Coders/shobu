import { describe, expect, it } from 'vitest'
import { type AimSource, driveViewmodelRig, type SwayRig } from './driveViewmodelRig.ts'
import type { LensRenderLoop } from './firstPersonLens.ts'
import type { ViewmodelPlacement } from './loadSniperViewmodel.ts'
import { createViewBob, type ViewBob } from './viewBob.ts'
import { createViewmodelSway } from './viewmodelSway.ts'

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

/** Rig de mentira: guarda a última posição e rotação escritas. */
class FakeRig implements SwayRig {
  readonly position = new FakeTriple()
  readonly rotation = new FakeTriple()
}

class FakeTriple {
  x = 0
  y = 0
  z = 0
  set(x: number, y: number, z: number): void {
    this.x = x
    this.y = y
    this.z = z
  }
}

/** Mira de mentira: o teste gira a câmera à mão. */
class FakeAim implements AimSource {
  readonly rotation = { x: 0, y: 0 }
}

const PLACEMENT: ViewmodelPlacement = { offsetM: [0.04, -0.16, 0.34], yawRad: -0.04, pitchRad: 0 }

interface RigFixture {
  readonly loop: FakeRenderLoop
  readonly rig: FakeRig
  readonly aim: FakeAim
  readonly bob: ViewBob
}

function mountRig(enabled = true): RigFixture {
  const fixture = {
    loop: new FakeRenderLoop(),
    rig: new FakeRig(),
    aim: new FakeAim(),
    bob: createViewBob(enabled),
  }
  driveViewmodelRig(fixture.loop, {
    rig: fixture.rig,
    aim: fixture.aim,
    placement: PLACEMENT,
    sway: createViewmodelSway(enabled),
    bob: fixture.bob,
    frameDeltaMs: () => 1000 / 60,
  })
  return fixture
}

describe('driveViewmodelRig', () => {
  it('põe a arma no deslocamento ajustado, mais o balanço', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    expect(fixture.rig.position.x).toBeCloseTo(PLACEMENT.offsetM[0], 2)
    expect(fixture.rig.position.z).toBe(PLACEMENT.offsetM[2])
  })

  it('girar a mira empurra a arma para o lado contrário', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    fixture.aim.rotation.y = 0.2
    fixture.loop.renderFrame()
    expect(fixture.rig.rotation.y).toBeLessThan(PLACEMENT.yawRad)
  })

  /** Regressão: sem `wrapAngleRad`, a volta completa daria um tranco de 6,28 rad. */
  it('a volta completa da mira não dá tranco na arma', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    fixture.aim.rotation.y = Math.PI * 2
    fixture.loop.renderFrame()
    expect(fixture.rig.rotation.y).toBeCloseTo(PLACEMENT.yawRad, 3)
  })

  /**
   * O driver da câmera é dono da fase da passada. Avançá-la aqui também tiraria
   * a arma de fase com a câmera, que é o motivo de as duas compartilharem o
   * mesmo `ViewBob`.
   */
  it('não avança a fase da passada, que é do balanço de câmera', () => {
    const fixture = mountRig()
    fixture.bob.phase = 1.2
    fixture.loop.renderFrame()
    expect(fixture.bob.phase).toBe(1.2)
  })

  it('desligado, a arma fica exatamente no deslocamento ajustado', () => {
    const fixture = mountRig(false)
    fixture.aim.rotation.y = 1.5
    fixture.loop.renderFrame()
    fixture.loop.renderFrame()
    expect(fixture.rig.position.x).toBe(PLACEMENT.offsetM[0])
    expect(fixture.rig.position.y).toBe(PLACEMENT.offsetM[1])
    expect(fixture.rig.rotation.y).toBe(PLACEMENT.yawRad)
    expect(fixture.rig.rotation.z).toBe(0)
  })
})
