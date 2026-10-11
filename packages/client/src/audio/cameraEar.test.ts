import type { Vector3 } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { type EarCamera, listenFromCamera } from './cameraEar.ts'

/** Uma câmera que olha para a direita: gira +z local para +x do mundo. */
class FakeSidewaysCamera implements EarCamera<Vector3> {
  readonly globalPosition = { x: 3, y: 1.7, z: -2 }
  turns = 0

  getDirectionToRef(localAxis: Vector3, result: Vector3): void {
    this.turns += 1
    result.x = localAxis.z
    result.y = localAxis.y
    result.z = 0 - localAxis.x
  }
}

describe('listenFromCamera', () => {
  it('o ouvido fica onde a câmera está e olha para onde ela olha', () => {
    const camera = new FakeSidewaysCamera()
    const listen = listenFromCamera(camera, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 })
    const eye = { x: 0, y: 0, z: 0 }
    const forward = { x: 0, y: 0, z: 0 }
    listen(eye, forward)
    expect([eye, forward]).toEqual([
      { x: 3, y: 1.7, z: -2 },
      { x: 1, y: 0, z: 0 },
    ])
    expect(camera.turns).toBe(1)
  })
})
