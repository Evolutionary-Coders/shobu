import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { keepsOwnGlow } from './selfLitParts.ts'

/**
 * As duas snipers dividem o rig: o mesmo balanço, o mesmo clipe, a mesma boca
 * do cano (`SNIPER_MUZZLE_M`) e o mesmo ombro esquerdo (`dropLeftArm.ts`)
 * valem para as duas só enquanto os glb concordarem. Este teste é essa trava.
 */
const VIEWMODEL_DIR = new URL('../../public/assets/viewmodel/', import.meta.url)

interface GltfJson {
  readonly nodes: readonly { name?: string }[]
  readonly skins?: readonly { joints: readonly number[] }[]
  readonly animations?: readonly { name?: string }[]
}

/** O json de um glb: cabeçalho de 12 bytes, e o primeiro bloco é o json. */
function gltfOf(file: string): GltfJson {
  const bytes = readFileSync(new URL(file, VIEWMODEL_DIR))
  const length = bytes.readUInt32LE(12)
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as GltfJson
}

function jointNames(gltf: GltfJson): string[] {
  const skin = gltf.skins?.find((candidate) => candidate.joints.length === 50)
  return (skin?.joints ?? []).map((joint) => gltf.nodes[joint]?.name ?? '')
}

describe('o sniper-laser.glb', () => {
  const classic = gltfOf('sniper.glb')
  const laser = gltfOf('sniper-laser.glb')

  it('tem o clipe allanims', () => {
    expect(laser.animations?.map((animation) => animation.name)).toContain('allanims')
  })

  it('tem a pele de 50 juntas da clássica, com os mesmos nomes', () => {
    expect(jointNames(laser)).toHaveLength(50)
    expect(jointNames(laser)).toEqual(jointNames(classic))
  })

  /** Sem os nós `laser_*`, o acabamento tingiria o neon e a regra de brilho não acharia nada. */
  it('traz as peças de neon com o nome que a regra de brilho espera', () => {
    const names = laser.nodes.map((node) => node.name ?? '')
    expect(names.filter(keepsOwnGlow).length).toBeGreaterThan(0)
    expect(names).toContain('laser_emitter')
  })
})
