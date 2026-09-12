import { describe, expect, it } from 'vitest'
import { SNIPER_PLACEMENT, type ViewmodelPlacement } from './loadSniperViewmodel.ts'
import {
  followWorldCamera,
  framePoint,
  type Maskable,
  maskAsViewmodel,
  SCOPE_EYEPIECE_M,
  VIEWMODEL_FOV_DEG,
  VIEWMODEL_LAYER,
  WORLD_LAYER,
} from './viewmodelCamera.ts'

/**
 * O `createViewmodelCamera` não tem teste: ele instancia uma `UniversalCamera`,
 * que exige uma `Scene`, que exige um contexto webgl que não existe no node
 * (ADR 0001). O que é lógica mora nas funções puras abaixo, e é o que o teste
 * cobre — o mesmo desenho de `arenaLighting.ts`.
 */

/** Malha de mentira: só o campo que a máscara escreve. */
class FakeMesh implements Maskable {
  layerMask = WORLD_LAYER
}

/** Câmera de mentira, com o `copyFrom` que o babylon expõe nos vetores. */
class FakeCamera {
  readonly position = new FakeVector()
  readonly rotation = new FakeVector()
}

class FakeVector {
  x = 0
  y = 0
  z = 0
  copyFrom(source: { x: number; y: number; z: number }): void {
    this.x = source.x
    this.y = source.y
    this.z = source.z
  }
}

const WIDESCREEN = 16 / 9

describe('máscara de camada do viewmodel', () => {
  /** Se os dois bits se cruzassem, a câmera do mundo desenharia a arma de novo. */
  it('a camada do viewmodel não cruza com a do mundo', () => {
    expect(WORLD_LAYER & VIEWMODEL_LAYER).toBe(0)
    expect(VIEWMODEL_LAYER).not.toBe(0)
    expect(WORLD_LAYER).not.toBe(0)
  })

  it('marca todas as malhas da arma', () => {
    const meshes = [new FakeMesh(), new FakeMesh(), new FakeMesh()]
    maskAsViewmodel(meshes)
    for (const mesh of meshes) expect(mesh.layerMask).toBe(VIEWMODEL_LAYER)
  })

  it('não faz nada com lista vazia, que é o glb que não carregou', () => {
    expect(() => maskAsViewmodel([])).not.toThrow()
  })
})

describe('followWorldCamera', () => {
  it('copia posição e rotação da câmera do mundo', () => {
    const world = new FakeCamera()
    world.position.copyFrom({ x: 3, y: 1.8, z: -12 })
    world.rotation.copyFrom({ x: 0.2, y: -1.1, z: 0 })
    const viewmodel = new FakeCamera()
    followWorldCamera(world, viewmodel)
    expect(viewmodel.position).toMatchObject({ x: 3, y: 1.8, z: -12 })
    expect(viewmodel.rotation).toMatchObject({ x: 0.2, y: -1.1, z: 0 })
  })
})

describe('framePoint', () => {
  /**
   * A regressão de enquadramento. A posição da arma foi ajustada a olho **uma
   * vez**, com o fov de 120° do mundo, e a luneta caiu em (0,335, 0,113) da
   * meia-tela. O deslocamento de hoje foi resolvido para manter esse ponto com
   * o fov de 65° da câmera própria: quem mexer em `SNIPER_PLACEMENT` sem
   * resolver a conta de novo quebra aqui.
   */
  it('a luneta continua no ponto de tela em que foi ajustada a olho', () => {
    const [x, y] = framePoint(SNIPER_PLACEMENT, SCOPE_EYEPIECE_M, VIEWMODEL_FOV_DEG, WIDESCREEN)
    expect(x).toBeCloseTo(0.335, 2)
    expect(y).toBeCloseTo(0.113, 2)
  })

  it('o mesmo ponto num fov mais largo cai mais perto do centro', () => {
    const narrow = framePoint(SNIPER_PLACEMENT, SCOPE_EYEPIECE_M, 65, WIDESCREEN)
    const wide = framePoint(SNIPER_PLACEMENT, SCOPE_EYEPIECE_M, 120, WIDESCREEN)
    expect(Math.abs(wide[0])).toBeLessThan(Math.abs(narrow[0]))
    expect(Math.abs(wide[1])).toBeLessThan(Math.abs(narrow[1]))
  })

  it('o ponto na frente do olho, sem giro nem deslocamento, cai no centro', () => {
    const centered: ViewmodelPlacement = { offsetM: [0, 0, 1], yawRad: 0, pitchRad: 0 }
    expect(framePoint(centered, [0, 0, 0], 90, WIDESCREEN)).toEqual([0, 0])
  })

  it('recusa ponto atrás do olho, que não tem posição de tela', () => {
    const behind: ViewmodelPlacement = { offsetM: [0, 0, 0.1], yawRad: 0, pitchRad: 0 }
    expect(() => framePoint(behind, [0, 0, -0.5], 65, WIDESCREEN)).toThrow(/esperado > 0/)
  })
})
