import { type GreyboxBlock, ICHIBAN_GAI_LAYOUT, NEON_KAIDO_LAYOUT } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  type MinimapFrame,
  type MinimapOp,
  type MinimapView,
  minimapBlipAlpha,
  minimapLevelOf,
  minimapMatrixOf,
  minimapOpsOf,
  minimapPlanOf,
  minimapPointOf,
  pingBarOf,
} from './minimapModel.ts'

const NORTH: MinimapFrame = {
  selfM: { x: 0, y: 0, z: 0 },
  facingM: { x: 0, z: 1 },
  rangeM: 35,
  radiusPx: 100,
}

function pointAt(frame: MinimapFrame, x: number, z: number) {
  return minimapPointOf(minimapMatrixOf(frame), frame, x, z)
}

function block(layer: GreyboxBlock['layer']): GreyboxBlock {
  return { name: layer, centerM: [10, 1, 20], sizeM: [4, 2, 6], layer, zone: 'rua' }
}

describe('minimapPointOf', () => {
  it('olhando para +z, o que está à frente fica acima do centro e +x à direita', () => {
    const ahead = pointAt(NORTH, 0, 17.5)
    expect([ahead.x, ahead.y, ahead.clamped]).toEqual([100, 50, false])
    expect(pointAt(NORTH, 17.5, 0).x).toBeCloseTo(150)
  })

  it('olhando para o leste, o inimigo a leste fica em cima e o norte à esquerda', () => {
    const east = { ...NORTH, facingM: { x: 1, z: 0 } }
    const enemy = pointAt(east, 17.5, 0)
    expect(enemy.x).toBeCloseTo(100)
    expect(enemy.y).toBeCloseTo(50)
    expect(pointAt(east, 0, 17.5).x).toBeCloseTo(50)
  })

  it('o jogador fora da origem fica no centro, e o olhar não precisa ser unitário', () => {
    const moved = { ...NORTH, selfM: { x: 5, y: 0, z: 5 }, facingM: { x: 0, z: 9 } }
    const self = pointAt(moved, 5, 5)
    expect(self.x).toBeCloseTo(100)
    expect(self.y).toBeCloseTo(100)
  })

  it('o olhar reto para cima vale como olhar para +z', () => {
    const up = { ...NORTH, facingM: { x: 0, z: 0 } }
    expect(pointAt(up, 0, 17.5).y).toBeCloseTo(50)
  })

  it('além do alcance o ponto fica preso na borda, na mesma direção', () => {
    const far = pointAt(NORTH, 0, 500)
    expect(far.clamped).toBe(true)
    expect(far.x).toBeCloseTo(100)
    expect(far.y).toBeCloseTo(6)
  })
})

describe('minimapBlipAlpha e minimapLevelOf', () => {
  it('o ponto desbota em linha reta e some no fim da vida', () => {
    expect([
      minimapBlipAlpha(10, 10, 2),
      minimapBlipAlpha(10, 11, 2),
      minimapBlipAlpha(10, 13, 2),
      minimapBlipAlpha(10, 9, 2),
      minimapBlipAlpha(10, 10, 0),
    ]).toEqual([1, 0.5, 0, 1, 0])
  })

  it('o inimigo noutro andar ganha a seta', () => {
    expect([minimapLevelOf(10, 2), minimapLevelOf(2, 10), minimapLevelOf(4, 2)]).toEqual([
      'above',
      'below',
      'level',
    ])
  })
})

describe('minimapPlanOf', () => {
  it('cada camada no seu estilo, e o chão e a laje ficam de fora', () => {
    const plan = minimapPlanOf({
      id: 'teste',
      playArea: NEON_KAIDO_LAYOUT.playArea,
      blockout: [
        block('floor'),
        block('ledge'),
        block('building'),
        block('cover'),
        block('outskirt'),
      ],
    })
    expect(plan.rects).toEqual([
      { xM: 8, zM: 17, widthM: 4, depthM: 6, style: 'solid' },
      { xM: 8, zM: 17, widthM: 4, depthM: 6, style: 'outline' },
      { xM: 8, zM: 17, widthM: 4, depthM: 6, style: 'dim' },
    ])
    expect(plan.arenaId).toBe('teste')
  })

  it.each([NEON_KAIDO_LAYOUT, ICHIBAN_GAI_LAYOUT])('a planta de $id tem prédio', (layout) => {
    const plan = minimapPlanOf(layout)
    expect(plan.rects.some((rect) => rect.style === 'solid')).toBe(true)
  })
})

describe('minimapOpsOf', () => {
  const view: MinimapView = {
    ...NORTH,
    arenaId: 'neon-kaido',
    nowS: 10,
    jammed: false,
    pinging: true,
    blips: [
      { xM: 0, yM: 5, zM: 17.5, seenAtS: 9, lifeS: 2, kind: 'sweep' },
      { xM: 0, yM: 0, zM: 5, seenAtS: 5, lifeS: 2, kind: 'shot' },
    ],
  }

  it('o disco, a planta, os pontos vivos e a seta, nessa ordem', () => {
    const kinds = minimapOpsOf(view).map((op) => op.kind)
    expect(kinds).toEqual(['disc', 'plan', 'blip', 'arrow'])
    const blip = minimapOpsOf(view)[2] as Extract<MinimapOp, { kind: 'blip' }>
    expect(blip).toMatchObject({ x: 100, y: 50, alpha: 0.5, level: 'above', tone: 'sweep' })
  })

  it('embaralhado, só o ruído e a seta: nem planta nem pontos', () => {
    const ops = minimapOpsOf({ ...view, jammed: true })
    expect(ops).toEqual([{ kind: 'disc', pinging: true }, { kind: 'noise' }, { kind: 'arrow' }])
  })
})

describe('pingBarOf', () => {
  it('a barra cheia no acionamento, o texto em segundos inteiros, e nada sem PING', () => {
    expect(pingBarOf(15, 15)).toEqual({ fraction: 1, text: 'PING 15s' })
    expect(pingBarOf(11.2, 15)?.text).toBe('PING 12s')
    expect(pingBarOf(20, 15)?.fraction).toBe(1)
    expect([pingBarOf(0, 15), pingBarOf(3, 0)]).toEqual([undefined, undefined])
  })
})
