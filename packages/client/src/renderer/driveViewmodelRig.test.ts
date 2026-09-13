import { describe, expect, it } from 'vitest'
import { driveViewmodelRig, type SwayRig } from './driveViewmodelRig.ts'
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

const PLACEMENT: ViewmodelPlacement = { offsetM: [0.04, -0.16, 0.65], yawRad: -0.04, pitchRad: 0 }

interface RigFixture {
  readonly loop: FakeRenderLoop
  readonly rig: FakeRig
  readonly bob: ViewBob
}

function mountRig(enabled = true): RigFixture {
  const fixture = {
    loop: new FakeRenderLoop(),
    rig: new FakeRig(),
    bob: createViewBob(enabled),
  }
  driveViewmodelRig(fixture.loop, {
    rig: fixture.rig,
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

  /**
   * A garantia que o jogador pediu: girar a mira **não** move a arma. Ela é
   * filha da câmera e acompanha o giro rigidamente, e este módulo nem recebe a
   * câmera — não há como o giro entrar na conta (ver `viewmodelSway.ts`).
   */
  it('o giro da arma é sempre o do ajuste, sem atraso nenhum', () => {
    const fixture = mountRig()
    for (let frame = 0; frame < 30; frame += 1) {
      fixture.loop.renderFrame()
      expect(fixture.rig.rotation.y).toBe(PLACEMENT.yawRad)
      expect(fixture.rig.rotation.x).toBe(PLACEMENT.pitchRad)
    }
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

  it('a passada da câmera chega à arma', () => {
    const fixture = mountRig()
    fixture.bob.phase = Math.PI
    fixture.bob.amplitude = 1
    for (let frame = 0; frame < 60; frame += 1) fixture.loop.renderFrame()
    expect(Math.abs(fixture.rig.rotation.z)).toBeGreaterThan(0)
  })

  it('desligado, a arma fica exatamente no deslocamento ajustado', () => {
    const fixture = mountRig(false)
    fixture.loop.renderFrame()
    fixture.loop.renderFrame()
    expect(fixture.rig.position.x).toBe(PLACEMENT.offsetM[0])
    expect(fixture.rig.position.y).toBe(PLACEMENT.offsetM[1])
    expect(fixture.rig.rotation.y).toBe(PLACEMENT.yawRad)
    expect(fixture.rig.rotation.z).toBe(0)
  })
})
