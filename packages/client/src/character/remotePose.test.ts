import { describe, expect, it } from 'vitest'
import { createRemotePlayerView } from '../net/remotePlayerView.ts'
import { poseOfRemotePlayer } from './remotePose.ts'
import { createLocomotionPose } from './thirdPersonClips.ts'

const LOOKING_NORTH = { x: 0, y: 0, z: 1 }

function viewAt(x: number, z: number): ReturnType<typeof createRemotePlayerView> {
  const view = createRemotePlayerView()
  view.feetM.x = x
  view.feetM.z = z
  view.aim.x = LOOKING_NORTH.x
  view.aim.z = LOOKING_NORTH.z
  return view
}

describe('poseOfRemotePlayer', () => {
  it('mede a velocidade pelo deslocamento entre dois quadros', () => {
    const pose = poseOfRemotePlayer(
      viewAt(0, 0.1),
      { x: 0, y: 0, z: 0 },
      0.02,
      createLocomotionPose(),
    )
    expect(pose.horizontalSpeedMps).toBeCloseTo(5, 9)
  })

  it.each([
    ['para a frente', 0, 1, 1, 0],
    ['para trás', 0, -1, -1, 0],
    ['para a direita', 1, 0, 0, 1],
    ['para a esquerda', -1, 0, 0, -1],
    ['na diagonal frente-direita', 1, 1, 1, 1],
  ] as const)('andando %s, relativo à mira', (_label, dx, dz, ahead, side) => {
    const pose = poseOfRemotePlayer(
      viewAt(dx * 0.1, dz * 0.1),
      { x: 0, y: 0, z: 0 },
      0.02,
      createLocomotionPose(),
    )
    expect(pose).toMatchObject({ ahead, side })
  })

  it('fica parado sem deslocamento e em quadro de duração zero', () => {
    const still = poseOfRemotePlayer(
      viewAt(0, 0),
      { x: 0, y: 0, z: 0 },
      0.02,
      createLocomotionPose(),
    )
    expect(still).toMatchObject({ horizontalSpeedMps: 0, ahead: 0, side: 0 })
    const zeroFrame = poseOfRemotePlayer(
      viewAt(1, 1),
      { x: 0, y: 0, z: 0 },
      0,
      createLocomotionPose(),
    )
    expect(zeroFrame.horizontalSpeedMps).toBe(0)
  })

  it('leva a postura e o chão do snapshot', () => {
    const view = viewAt(0, 0)
    view.stance = 'sliding'
    view.grounded = true
    expect(
      poseOfRemotePlayer(view, { x: 0, y: 0, z: 0 }, 0.02, createLocomotionPose()),
    ).toMatchObject({
      stance: 'sliding',
      grounded: true,
    })
  })
})
