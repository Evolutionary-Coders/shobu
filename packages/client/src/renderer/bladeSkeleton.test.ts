import { describe, expect, it } from 'vitest'
import {
  type AnimationGroupLike,
  blendSkeletalPose,
  type ChannelTrack,
  CLIP_FADE_S,
  createSkeletalMixer,
  mixSkeletalClip,
  NODE_STRIDE,
  readSkeletalLibrary,
  type SkeletalClip,
  sampleChannel,
  sampleSkeletalClip,
} from './bladeSkeleton.ts'

const HALF_TURN_Z = [0, 0, 1, 0]
const IDENTITY = [0, 0, 0, 1]

function rotation(node: number, timesS: number[], quaternions: number[][]): ChannelTrack {
  return {
    node,
    path: 'rotation',
    timesS: Float32Array.from(timesS),
    values: Float32Array.from(quaternions.flat()),
  }
}

function position(node: number, timesS: number[], points: number[][]): ChannelTrack {
  return {
    node,
    path: 'position',
    timesS: Float32Array.from(timesS),
    values: Float32Array.from(points.flat()),
  }
}

/** Dois nós em descanso: giro nenhum, em (1, 2, 3). */
function restOf(nodes: number): Float32Array {
  const rest = new Float32Array(nodes * NODE_STRIDE)
  for (let node = 0; node < nodes; node += 1) rest.set([...IDENTITY, 1, 2, 3], node * NODE_STRIDE)
  return rest
}

describe('sampleChannel', () => {
  const quarter = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  const track = rotation(0, [0, 1], [IDENTITY, quarter])

  it('antes da primeira chave vale a primeira, depois da última vale a última', () => {
    const out = restOf(1)
    sampleChannel(track, -1, out)
    expect([...out.slice(0, 4)]).toEqual(IDENTITY)
    sampleChannel(track, 5, out)
    expect(out[2]).toBeCloseTo(Math.SQRT1_2)
  })

  it('entre duas chaves, o giro do meio, normalizado', () => {
    const out = restOf(1)
    sampleChannel(track, 0.5, out)
    expect(Math.hypot(...out.slice(0, 4))).toBeCloseTo(1)
    // nlerp de 0° a 90° no meio é 45°: sen(22,5°) no z.
    expect(out[2]).toBeCloseTo(Math.sin(Math.PI / 8))
  })

  it('chave degenerada (quaternion nulo) não vira NaN', () => {
    const out = restOf(1)
    sampleChannel(
      rotation(
        0,
        [0, 1],
        [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      ),
      0.5,
      out,
    )
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 0])
  })

  it('a posição vai no lugar dela, depois do giro', () => {
    const out = restOf(2)
    sampleChannel(
      position(
        1,
        [0, 2],
        [
          [0, 0, 0],
          [2, 4, 6],
        ],
      ),
      1,
      out,
    )
    expect([...out.slice(NODE_STRIDE + 4, NODE_STRIDE + 7)]).toEqual([1, 2, 3])
  })
})

describe('sampleSkeletalClip', () => {
  it('o que o clipe não anima fica no descanso', () => {
    const clip: SkeletalClip = {
      durationS: 1,
      channels: [rotation(1, [0, 1], [HALF_TURN_Z, HALF_TURN_Z])],
    }
    const out = sampleSkeletalClip(clip, 0.5, restOf(2), new Float32Array(2 * NODE_STRIDE))
    expect([...out.slice(0, NODE_STRIDE)]).toEqual([...IDENTITY, 1, 2, 3])
    expect([...out.slice(NODE_STRIDE, NODE_STRIDE + 4)]).toEqual(HALF_TURN_Z)
  })
})

describe('blendSkeletalPose', () => {
  it('mistura pelo caminho curto: q e -q são o mesmo giro', () => {
    const from = restOf(1)
    const to = restOf(1)
    to.set([0, 0, 0, -1, 3, 2, 3])
    const out = blendSkeletalPose(from, to, 0.5, new Float32Array(NODE_STRIDE))
    expect([...out.slice(0, 4)]).toEqual(IDENTITY)
    expect(out[4]).toBe(2)
  })
})

describe('mixSkeletalClip', () => {
  const still: SkeletalClip = { durationS: 1, channels: [] }
  const turned: SkeletalClip = {
    durationS: 1,
    channels: [position(0, [0], [[9, 9, 9]])],
  }

  it('troca de clipe parte da pose congelada e chega à nova em CLIP_FADE_S', () => {
    const mixer = createSkeletalMixer(restOf(1))
    mixSkeletalClip(mixer, still, 0, 0, 1 / 60)
    const halfway = mixSkeletalClip(mixer, turned, 0, 1, CLIP_FADE_S / 2)
    expect(halfway[4]).toBeGreaterThan(1)
    expect(halfway[4]).toBeLessThan(9)
    const done = mixSkeletalClip(mixer, turned, 0.1, 1, CLIP_FADE_S)
    expect(done[4]).toBe(9)
    expect(mixSkeletalClip(mixer, turned, 0.2, 1, 1 / 60)[4]).toBe(9)
  })
})

describe('readSkeletalLibrary', () => {
  const keyed = (property: string, values: { x: number; y: number; z: number; w?: number }[]) => ({
    targetProperty: property,
    framePerSecond: 60,
    getKeys: () => values.map((value, index) => ({ frame: index * 30, value })),
  })
  const groups: AnimationGroupLike<string>[] = [
    {
      name: 'katana_slash_1',
      to: 27,
      targetedAnimations: [
        { target: 'root', animation: keyed('position', [{ x: 1, y: 2, z: 3 }]) },
        { target: 'root', animation: keyed('rotationQuaternion', [{ x: 0, y: 0, z: 0, w: 1 }]) },
        { target: 'wrist', animation: keyed('rotationQuaternion', [{ x: 0, y: 1, z: 0 }]) },
        { target: 'wrist', animation: keyed('scaling', [{ x: 1, y: 1, z: 1 }]) },
      ],
    },
    {
      name: 'katana_idle',
      to: 180,
      targetedAnimations: [
        { target: 'wrist', animation: keyed('rotationQuaternion', [{ x: 0, y: 0, z: 0, w: 1 }]) },
      ],
    },
  ]

  it('um nó por alvo, e os clipes em tabelas planas, sem a escala', () => {
    const library = readSkeletalLibrary(groups)
    expect(library.nodes).toEqual(['root', 'wrist'])
    expect(library.movesPosition).toEqual([true, false])
    const slash = library.clips.get('katana_slash_1')
    expect(slash?.durationS).toBeCloseTo(0.45)
    expect(slash?.channels.map((channel) => channel.path)).toEqual([
      'position',
      'rotation',
      'rotation',
    ])
    // sem w no valor, o giro é o que sobra: w = 1.
    expect([...(slash?.channels[2]?.values ?? [])]).toEqual([0, 1, 0, 1])
    expect(library.clips.get('katana_idle')?.durationS).toBe(3)
  })
})
