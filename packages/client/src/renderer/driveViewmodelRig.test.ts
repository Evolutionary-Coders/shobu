import { describe, expect, it } from 'vitest'
import {
  type AimSource,
  type BodyMotion,
  driveViewmodelRig,
  type SwayRig,
} from './driveViewmodelRig.ts'
import type { LensRenderLoop } from './firstPersonLens.ts'
import type { ViewmodelPlacement } from './loadSniperViewmodel.ts'
import { createViewBob, type ViewBob } from './viewBob.ts'
import { createViewmodelSway } from './viewmodelSway.ts'
import { advanceRecoil, createWeaponRecoil, kickRecoil, type WeaponRecoil } from './weaponRecoil.ts'

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

const PLACEMENT: ViewmodelPlacement = { offsetM: [0.04, -0.16, 0.65], yawRad: -0.04, pitchRad: 0 }

interface RigFixture {
  readonly loop: FakeRenderLoop
  readonly rig: FakeRig
  readonly aim: FakeAim
  readonly bob: ViewBob
  readonly recoil: WeaponRecoil
  body: BodyMotion
}

function mountRig(enabled = true): RigFixture {
  const fixture: RigFixture = {
    loop: new FakeRenderLoop(),
    rig: new FakeRig(),
    aim: new FakeAim(),
    bob: createViewBob(enabled),
    recoil: createWeaponRecoil(enabled),
    body: { verticalSpeedMps: 0, sliding: false },
  }
  // espelha a ordem de produção: `driveArenaWeapon` registra o passo dele antes
  // e é quem avança o coice; este módulo só lê o valor já do quadro.
  const kick = { pitchDeltaRad: 0, rollRad: 0 }
  fixture.loop.onBeforeRenderObservable.add(() => {
    advanceRecoil(fixture.recoil, 1 / 60, kick)
  })
  driveViewmodelRig(fixture.loop, {
    rig: fixture.rig,
    aim: fixture.aim,
    body: () => fixture.body,
    placement: PLACEMENT,
    sway: createViewmodelSway(enabled),
    recoil: fixture.recoil,
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

  /** Sem `wrapAngleRad`, a volta completa daria um tranco de 6,28 rad. */
  it('a volta completa da mira não dá tranco na arma', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    fixture.aim.rotation.y = Math.PI * 2
    fixture.loop.renderFrame()
    expect(fixture.rig.rotation.y).toBeCloseTo(PLACEMENT.yawRad, 3)
  })

  /** Parado, a arma fica no ajuste: o atraso só existe enquanto a mira gira. */
  it('sem girar, a arma volta ao giro do ajuste', () => {
    const fixture = mountRig()
    fixture.aim.rotation.y = 0.3
    fixture.loop.renderFrame()
    for (let frame = 0; frame < 180; frame += 1) fixture.loop.renderFrame()
    expect(fixture.rig.rotation.y).toBeCloseTo(PLACEMENT.yawRad, 4)
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

  /** A passada zera no ar, e sem isto o pulo era o momento em que a arma parava. */
  it('pular afunda a arma, e o ar não a deixa parada', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    const resting = fixture.rig.position.y
    fixture.body = { verticalSpeedMps: 8.5, sliding: false }
    for (let frame = 0; frame < 10; frame += 1) fixture.loop.renderFrame()
    expect(fixture.rig.position.y).toBeLessThan(resting)
  })

  it('cair levanta a arma, para o lado contrário do pulo', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    const resting = fixture.rig.position.y
    fixture.body = { verticalSpeedMps: -8.5, sliding: false }
    for (let frame = 0; frame < 10; frame += 1) fixture.loop.renderFrame()
    expect(fixture.rig.position.y).toBeGreaterThan(resting)
  })

  /** O slide é a manobra mais teatral do jogo, e era onde a arma menos se mexia. */
  it('deslizar baixa e rola a arma', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    const resting = { y: fixture.rig.position.y, roll: fixture.rig.rotation.z }
    fixture.body = { verticalSpeedMps: 0, sliding: true }
    for (let frame = 0; frame < 30; frame += 1) fixture.loop.renderFrame()
    expect(fixture.rig.position.y).toBeLessThan(resting.y)
    expect(Math.abs(fixture.rig.rotation.z)).toBeGreaterThan(Math.abs(resting.roll) + 0.05)
  })

  it('sair do slide devolve a arma à pose normal', () => {
    const fixture = mountRig()
    fixture.body = { verticalSpeedMps: 0, sliding: true }
    for (let frame = 0; frame < 30; frame += 1) fixture.loop.renderFrame()
    fixture.body = { verticalSpeedMps: 0, sliding: false }
    for (let frame = 0; frame < 120; frame += 1) fixture.loop.renderFrame()
    expect(Math.abs(fixture.rig.rotation.z)).toBeLessThan(0.01)
  })

  /** O pedido: no disparo a arma vem para trás, na direção do ombro. */
  it('o disparo puxa a arma para trás e levanta o cano', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    const resting = { z: fixture.rig.position.z, pitch: fixture.rig.rotation.x }
    kickRecoil(fixture.recoil)
    fixture.loop.renderFrame()
    expect(fixture.rig.position.z).toBeLessThan(resting.z - 0.05)
    // negativo é para cima na convenção do rig.
    expect(fixture.rig.rotation.x).toBeLessThan(resting.pitch)
  })

  /**
   * Sem a subida, o recuo só muda o tamanho aparente da arma em 13 % e não a
   * desloca um pixel na tela: o olho lê "ficou maior", não "voltou". É a subida
   * que transforma profundidade em gesto.
   */
  it('o disparo também levanta a arma, que é o que torna o recuo visível', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    const resting = fixture.rig.position.y
    kickRecoil(fixture.recoil)
    fixture.loop.renderFrame()
    expect(fixture.rig.position.y).toBeGreaterThan(resting + 0.015)
  })

  it('a arma volta ao lugar depois do recuo', () => {
    const fixture = mountRig()
    fixture.loop.renderFrame()
    const resting = fixture.rig.position.z
    kickRecoil(fixture.recoil)
    for (let frame = 0; frame < 60; frame += 1) fixture.loop.renderFrame()
    expect(fixture.rig.position.z).toBeCloseTo(resting, 3)
  })

  /**
   * O recuo da **arma** sobrevive a "menos movimento": mexer num objeto a 65 cm
   * do olho não é o gatilho vestibular que mexer na câmera é, e é a confirmação
   * mais direta de que o tiro saiu.
   */
  it('com menos movimento o recuo da arma continua', () => {
    const fixture = mountRig(false)
    fixture.loop.renderFrame()
    const resting = fixture.rig.position.z
    kickRecoil(fixture.recoil)
    fixture.loop.renderFrame()
    expect(fixture.rig.position.z).toBeLessThan(resting - 0.05)
  })

  it('desligado, a arma fica exatamente no deslocamento ajustado', () => {
    const fixture = mountRig(false)
    fixture.aim.rotation.y = 1.5
    fixture.body = { verticalSpeedMps: 8.5, sliding: true }
    fixture.loop.renderFrame()
    fixture.loop.renderFrame()
    expect(fixture.rig.position.x).toBe(PLACEMENT.offsetM[0])
    expect(fixture.rig.position.y).toBe(PLACEMENT.offsetM[1])
    expect(fixture.rig.position.z).toBe(PLACEMENT.offsetM[2])
    expect(fixture.rig.rotation.y).toBe(PLACEMENT.yawRad)
    expect(fixture.rig.rotation.z).toBe(0)
  })
})
