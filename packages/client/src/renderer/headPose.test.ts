import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { describe, expect, it } from 'vitest'
import {
  type DeviceAngles,
  eulerOf,
  type HeadQuaternion,
  headFromDevice,
  turnHead,
  yawOffsetFor,
} from './headPose.ts'

function quaternion(): HeadQuaternion {
  return { x: 0, y: 0, z: 0, w: 1 }
}

/** Um eixo local da câmera, em mundo, girado pelo babylon: o que ele desenharia. */
function axisOf(pose: HeadQuaternion, local: Vector3): Vector3 {
  const q = new Quaternion(pose.x, pose.y, pose.z, pose.w)
  return local.rotateByQuaternionToRef(q, new Vector3())
}

function expectVector(actual: Vector3, expected: readonly [number, number, number]): void {
  expect(actual.asArray()).toEqual(expected.map((value) => expect.closeTo(value, 6)))
}

function head(angles: Partial<DeviceAngles>): HeadQuaternion {
  const full = { alphaDeg: 0, betaDeg: 0, gammaDeg: 0, screenDeg: 0, ...angles }
  return headFromDevice(full, quaternion())
}

describe('headFromDevice', () => {
  it('celular em pé, em retrato: olha para o norte (+z), com o topo para cima', () => {
    const pose = head({ betaDeg: 90 })
    expectVector(axisOf(pose, Vector3.Forward()), [0, 0, 1])
    expectVector(axisOf(pose, Vector3.Up()), [0, 1, 0])
  })

  it('deitado de tela para cima: quem olha para dentro da tela olha para o chão', () => {
    expectVector(axisOf(head({}), Vector3.Forward()), [0, -1, 0])
  })

  it('girar o aparelho para a esquerda vira a vista para a esquerda (-x)', () => {
    expectVector(axisOf(head({ alphaDeg: 90, betaDeg: 90 }), Vector3.Forward()), [-1, 0, 0])
  })

  it('inclinar o topo do aparelho para trás olha para cima', () => {
    expect(axisOf(head({ betaDeg: 120 }), Vector3.Forward()).y).toBeGreaterThan(0.4)
  })

  it('no óculos (paisagem, topo à esquerda, de pé): horizonte, norte, sem rolagem', () => {
    // em paisagem com o topo do aparelho à esquerda, o eixo y do aparelho
    // aponta para oeste: é girar o retrato 90° em torno da tela.
    const pose = head({ betaDeg: 0, gammaDeg: -90, screenDeg: 90 })
    const ahead = axisOf(pose, Vector3.Forward())
    expect(Math.abs(ahead.y)).toBeLessThan(1e-6)
    expectVector(axisOf(pose, Vector3.Up()), [0, 1, 0])
  })

  it('no óculos, inclinar a cabeça para a direita rola a vista para a direita', () => {
    const level = head({ gammaDeg: -90, screenDeg: 90 })
    // com o topo do aparelho à esquerda, rolar a cabeça para a direita levanta o
    // topo: é beta positivo, e o olhar (o -z do aparelho) não sai do lugar.
    const tilted = head({ gammaDeg: -90, betaDeg: 20, screenDeg: 90 })
    const right = axisOf(level, Vector3.Right())
    const tiltedUp = axisOf(tilted, Vector3.Up())
    // a cabeça rolou para a direita: o "para cima" da vista pende para a direita.
    expect(tiltedUp.dot(right)).toBeGreaterThan(0.3)
    expectVector(
      axisOf(tilted, Vector3.Forward()),
      axisOf(level, Vector3.Forward()).asArray() as [number, number, number],
    )
  })

  it('devolve sempre um quaternion unitário, em qualquer quadrante', () => {
    for (const alphaDeg of [0, 100, 200, 300]) {
      for (const betaDeg of [-170, -60, 0, 60, 170]) {
        const pose = head({ alphaDeg, betaDeg, gammaDeg: 45, screenDeg: 270 })
        expect(Math.hypot(pose.x, pose.y, pose.z, pose.w)).toBeCloseTo(1, 9)
      }
    }
  })
})

describe('turnHead', () => {
  it('soma guinada sem mexer na inclinação nem na rolagem', () => {
    const pose = head({ alphaDeg: 30, betaDeg: 70, gammaDeg: 10 })
    const before = eulerOf(pose, { x: 0, y: 0, z: 0 })
    const after = eulerOf(turnHead(0.7, { ...pose }), { x: 0, y: 0, z: 0 })
    expect([after.x, after.z]).toEqual([expect.closeTo(before.x, 9), expect.closeTo(before.z, 9)])
    expect(after.y).toBeCloseTo(before.y + 0.7, 9)
  })

  it('meia-volta inverte para onde se olha', () => {
    const pose = head({ betaDeg: 90 })
    expectVector(axisOf(turnHead(Math.PI, pose), Vector3.Forward()), [0, 0, -1])
  })
})

describe('eulerOf', () => {
  it('é o toEulerAngles do babylon', () => {
    const pose = head({ alphaDeg: 123, betaDeg: 47, gammaDeg: -33, screenDeg: 90 })
    const ours = eulerOf(pose, { x: 0, y: 0, z: 0 })
    const theirs = new Quaternion(pose.x, pose.y, pose.z, pose.w).toEulerAngles()
    expect([ours.x, ours.y, ours.z]).toEqual([
      expect.closeTo(theirs.x, 9),
      expect.closeTo(theirs.y, 9),
      expect.closeTo(theirs.z, 9),
    ])
  })

  it('reto para baixo: a rolagem vai a zero e a guinada leva tudo', () => {
    const down = Quaternion.RotationYawPitchRoll(0.4, Math.PI / 2, 0.3)
    const ours = eulerOf({ x: down.x, y: down.y, z: down.z, w: down.w }, { x: 0, y: 0, z: 0 })
    expect([ours.x, ours.z]).toEqual([expect.closeTo(Math.PI / 2, 6), 0])
    expect(ours.y).toBeCloseTo(0.4 - 0.3, 6)
  })

  it('reto para cima, o mesmo do outro lado', () => {
    const up = Quaternion.RotationYawPitchRoll(0.4, -Math.PI / 2, 0)
    const ours = eulerOf({ x: up.x, y: up.y, z: up.z, w: up.w }, { x: 0, y: 0, z: 0 })
    expect([ours.x, ours.y, ours.z]).toEqual([
      expect.closeTo(-Math.PI / 2, 6),
      expect.closeTo(0.4, 6),
      0,
    ])
  })
})

describe('yawOffsetFor', () => {
  it('leva a guinada da cabeça para a guinada pedida', () => {
    const pose = head({ alphaDeg: 300, betaDeg: 80, gammaDeg: 5 })
    turnHead(yawOffsetFor(pose, 1.2), pose)
    expect(eulerOf(pose, { x: 0, y: 0, z: 0 }).y).toBeCloseTo(1.2, 9)
  })
})
