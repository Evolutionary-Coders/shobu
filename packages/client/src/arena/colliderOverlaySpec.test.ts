import { COLLIDER_BODY_ONLY, COLLIDER_GRAPPLE_ONLY, COLLIDER_SOLID } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { blockBetween } from './arenaBlock.ts'
import { colliderOverlayGroups } from './colliderOverlaySpec.ts'
import { propBetween } from './propCollider.ts'

describe('colliderOverlayGroups', () => {
  const floor = blockBetween('piso', 'floor', 'rua', [-5, -1, -5], [5, 0, 5])
  const wall = blockBetween('limite', 'barrier', 'rua', [5, 0, -5], [6, 9, 5])
  const lantern = propBetween('lanterna', COLLIDER_GRAPPLE_ONLY, [0, 4, 0], [1, 5, 1])
  const parapet = propBetween('platibanda', COLLIDER_SOLID, [0, 9, 0], [3, 9.9, 0.3])

  it('agrupa pelo que a caixa para, deixando de fora o blockout que para tudo', () => {
    const groups = colliderOverlayGroups({ blockout: [floor, wall], props: [lantern, parapet] })
    expect(groups.map((group) => [group.mask, group.boxes.length])).toEqual([
      [COLLIDER_SOLID, 1],
      [COLLIDER_BODY_ONLY, 1],
      [COLLIDER_GRAPPLE_ONLY, 1],
    ])
  })
})
