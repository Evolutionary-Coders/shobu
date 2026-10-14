import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { describe, expect, it } from 'vitest'
import { SNIPER_GAIT } from './gaitPose.ts'
import {
  cameraTurnQuaternion,
  createRigTransform,
  multiplyQuaternions,
  poseAboutGrip,
  type RigTransform,
  type RigVector,
  rotateVector,
  yawPitchRollQuaternion,
} from './gripPivot.ts'
import { createRigPose, rigPose } from './rigPose.ts'

/** O ajuste de descanso da sniper e a mão dela (`loadSniperViewmodel.ts`), copiados: aquele módulo é adapter. */
const SNIPER_OFFSET = { x: 0.1306, y: -0.1902, z: 0.65 }
const SNIPER_GRIP = { x: 0, y: -0.03, z: -0.17 }
/** A soleira da coronha e a boca do cano, no espaço do rig (medidos no blender). */
const STOCK_BUTT = { x: 0, y: 0.05, z: -0.509 }
const MUZZLE = { x: 0, y: 0.09, z: 1.026 }

function restingSniper(): RigTransform {
  const rig = createRigTransform()
  Object.assign(rig.position, SNIPER_OFFSET)
  yawPitchRollQuaternion(-0.04, 0, 0, rig.rotation)
  return rig
}

/** Um ponto do rig visto da câmera. */
function inCamera(rig: RigTransform, point: RigVector): RigVector {
  const out = rotateVector(rig.rotation, point, { x: 0, y: 0, z: 0 })
  return { x: out.x + rig.position.x, y: out.y + rig.position.y, z: out.z + rig.position.z }
}

function babylon(q: { x: number; y: number; z: number; w: number }): Quaternion {
  return new Quaternion(q.x, q.y, q.z, q.w)
}

describe('as contas do babylon', () => {
  it('o quaternion de guinada, inclinação e rolagem é o do babylon', () => {
    const mine = yawPitchRollQuaternion(0.3, -0.7, 1.1, { x: 0, y: 0, z: 0, w: 1 })
    const theirs = Quaternion.RotationYawPitchRoll(0.3, -0.7, 1.1)
    expect(mine.x).toBeCloseTo(theirs.x, 6)
    expect(mine.y).toBeCloseTo(theirs.y, 6)
    expect(mine.z).toBeCloseTo(theirs.z, 6)
    expect(mine.w).toBeCloseTo(theirs.w, 6)
  })

  it('compor e girar um vetor batem com o babylon', () => {
    const a = yawPitchRollQuaternion(0.4, 0.2, -0.5, { x: 0, y: 0, z: 0, w: 1 })
    const b = yawPitchRollQuaternion(-1.1, 0.9, 0.3, { x: 0, y: 0, z: 0, w: 1 })
    const composed = multiplyQuaternions(a, b, { x: 0, y: 0, z: 0, w: 1 })
    const turned = rotateVector(composed, { x: 0.1, y: -0.2, z: 0.3 }, { x: 0, y: 0, z: 0 })
    const expected = new Vector3(0.1, -0.2, 0.3).rotateByQuaternionToRef(
      babylon(a).multiply(babylon(b)),
      new Vector3(),
    )
    expect(turned.x).toBeCloseTo(expected.x, 6)
    expect(turned.y).toBeCloseTo(expected.y, 6)
    expect(turned.z).toBeCloseTo(expected.z, 6)
  })
})

describe('cameraTurnQuaternion', () => {
  it('inclinação positiva baixa o cano; guinada positiva o leva para a direita', () => {
    const forward = { x: 0, y: 0, z: 1 }
    const q = { x: 0, y: 0, z: 0, w: 1 }
    expect(
      rotateVector(cameraTurnQuaternion(rigPose({ pitchRad: 0.5 }), q), forward, forward).y,
    ).toBeLessThan(0)
    const ahead = { x: 0, y: 0, z: 1 }
    expect(
      rotateVector(cameraTurnQuaternion(rigPose({ yawRad: 0.5 }), q), ahead, ahead).x,
    ).toBeGreaterThan(0)
  })

  it('a rolagem vem por último e deita a arma no plano da tela; o cant gira em volta do cano', () => {
    const q = { x: 0, y: 0, z: 0, w: 1 }
    // o cano erguido e deitado para a esquerda: só a rolagem depois da inclinação faz isso.
    const barrel = rotateVector(
      cameraTurnQuaternion(rigPose({ pitchRad: -Math.PI / 2, rollRad: 0.3 }), q),
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 0 },
    )
    expect(barrel.x).toBeLessThan(-0.2)
    expect(barrel.y).toBeGreaterThan(0.9)
    const canted = rotateVector(
      cameraTurnQuaternion(rigPose({ cantRad: 0.8 }), q),
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 0 },
    )
    expect(canted.z).toBeCloseTo(1, 9)
  })
})

describe('poseAboutGrip', () => {
  it('a mão fica onde estava, mais o deslocamento da pose', () => {
    const rig = restingSniper()
    const before = inCamera(rig, SNIPER_GRIP)
    poseAboutGrip(
      rig,
      rigPose({
        x: 0.1,
        y: 0.05,
        z: -0.02,
        pitchRad: -1.2,
        yawRad: 0.4,
        rollRad: 0.3,
        cantRad: -1,
      }),
      SNIPER_GRIP,
    )
    const after = inCamera(rig, SNIPER_GRIP)
    expect(after.x - before.x).toBeCloseTo(0.1, 9)
    expect(after.y - before.y).toBeCloseTo(0.05, 9)
    expect(after.z - before.z).toBeCloseTo(-0.02, 9)
  })

  it('a pose de descanso não mexe no rig', () => {
    const rig = restingSniper()
    poseAboutGrip(rig, createRigPose(), SNIPER_GRIP)
    expect(rig.position.x).toBeCloseTo(SNIPER_OFFSET.x, 12)
    expect(rig.position.z).toBeCloseTo(SNIPER_OFFSET.z, 12)
  })

  /**
   * Regressão da corrida tática de 11/10: os ângulos da pose somados aos do
   * ajuste, girando em volta da origem do glb (no meio da arma), baixavam o
   * cano e erguiam a coronha até 14 cm do olho — um borrão preto cobrindo o
   * terço de baixo da tela.
   */
  it('na corrida plena o cano sobe acima da mão e a coronha fica abaixo dela, longe do olho', () => {
    const rig = restingSniper()
    poseAboutGrip(rig, SNIPER_GAIT.tactical, SNIPER_GRIP)
    const grip = inCamera(rig, SNIPER_GRIP)
    const muzzle = inCamera(rig, MUZZLE)
    const butt = inCamera(rig, STOCK_BUTT)
    expect(muzzle.y - grip.y).toBeGreaterThan(0.8)
    expect(butt.y).toBeLessThan(grip.y)
    expect(Math.hypot(butt.x, butt.y, butt.z)).toBeGreaterThan(0.45)
    // e à direita da mira: a arma no ombro, fora do centro da tela.
    expect(grip.x).toBeGreaterThan(0.15)
  })

  it('na corrida o cano aponta para baixo e para a esquerda', () => {
    const rig = restingSniper()
    poseAboutGrip(rig, SNIPER_GAIT.sprint, SNIPER_GRIP)
    const grip = inCamera(rig, SNIPER_GRIP)
    const muzzle = inCamera(rig, MUZZLE)
    expect(muzzle.x).toBeLessThan(grip.x)
    expect(muzzle.y).toBeLessThan(grip.y)
  })
})
