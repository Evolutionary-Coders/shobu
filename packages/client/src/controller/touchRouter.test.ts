import { describe, expect, it } from 'vitest'
import { createHeldStick } from './heldStick.ts'
import { createTouchRouter, isSprintPush } from './touchRouter.ts'
import { stickLayoutFromRects } from './touchStickLayout.ts'

/** Um iphone 12 deitado (844 × 390): o anel de 128 px e a zona do canto de baixo à esquerda. */
const LAYOUT = stickLayoutFromRects(
  { left: 28, top: 238, right: 156, bottom: 366 },
  { left: 20, top: 130, right: 320, bottom: 374 },
)
const BASE = LAYOUT.base
const R = LAYOUT.radius

describe('createTouchRouter', () => {
  it('a zona do analógico anda, o resto da tela mira', () => {
    const router = createTouchRouter()
    expect(router.down(1, { x: 100, y: 300 }, LAYOUT)).toBe('move')
    expect(router.down(2, { x: 700, y: 200 }, LAYOUT)).toBe('look')
  })

  it('a metade esquerda fora da zona mira: o alto da tela não acorda o analógico', () => {
    const router = createTouchRouter()
    expect(router.down(1, { x: 100, y: 60 }, LAYOUT)).toBe('look')
    expect(router.down(2, { x: 380, y: 300 }, LAYOUT)).toBe('none')
    expect(router.stickOrigin()).toBeUndefined()
  })

  it('o terceiro dedo, dentro ou fora da zona, não manda em nada', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, LAYOUT)
    router.down(2, { x: 700, y: 200 }, LAYOUT)
    expect(router.down(3, { x: 60, y: 300 }, LAYOUT)).toBe('none')
    expect(router.down(4, { x: 800, y: 50 }, LAYOUT)).toBe('none')
  })

  it('a origem é a base fixa, e não onde o polegar encosta', () => {
    const router = createTouchRouter()
    router.down(1, { x: 120, y: 280 }, LAYOUT)
    expect(router.stickOrigin()).toEqual(BASE)
    router.move(1, { x: BASE.x, y: BASE.y - R })
    expect(router.readStick(createHeldStick())).toEqual({ ahead: 1, side: 0 })
  })

  it('pousar fora do centro já empurra, sem esperar o primeiro arrasto', () => {
    const router = createTouchRouter()
    router.down(1, { x: BASE.x + R / 2, y: BASE.y }, LAYOUT)
    // meio curso, menos o que a zona morta reescala (`stickFromAxes`).
    const side = router.readStick(createHeldStick()).side
    expect([side > 0.3, side < 0.5]).toEqual([true, true])
  })

  // regressão: com a origem onde o dedo pousava, o polegar a 20 px da moldura
  // tinha 36% de curso para a esquerda — andar de lado era impossível.
  it('polegar encostado na borda esquerda ainda alcança side = -1', () => {
    const router = createTouchRouter()
    router.down(1, { x: 22, y: BASE.y }, LAYOUT)
    expect(router.readStick(createHeldStick()).side).toBeCloseTo(-1)
  })

  it('a zona morta segura o polegar parado perto do centro', () => {
    const router = createTouchRouter()
    router.down(1, { x: BASE.x + R * 0.1, y: BASE.y }, LAYOUT)
    expect(router.readStick(createHeldStick())).toEqual({ ahead: 0, side: 0 })
  })

  it('arrastar além do raio não passa do fim do curso', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, LAYOUT)
    router.move(1, { x: BASE.x + R * 3, y: BASE.y })
    const stick = router.readStick(createHeldStick())
    expect(stick.side).toBeCloseTo(1)
  })

  it('soltar o polegar para o personagem', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, LAYOUT)
    router.move(1, { x: 100, y: 200 })
    router.up(1)
    expect(router.readStick(createHeldStick())).toEqual({ ahead: 0, side: 0 })
    expect(router.stickOrigin()).toBeUndefined()
  })

  it('a mira acumula o arrasto e zera ao ser lida', () => {
    const router = createTouchRouter()
    router.down(2, { x: 600, y: 200 }, LAYOUT)
    router.move(2, { x: 610, y: 195 })
    router.move(2, { x: 625, y: 190 })
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 25, y: -10 })
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('o dedo que anda não mira, e o que mira não anda', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, LAYOUT)
    router.down(2, { x: 600, y: 200 }, LAYOUT)
    router.move(2, { x: 600, y: 100 })
    router.move(1, { x: BASE.x + R, y: BASE.y })
    expect(router.readStick(createHeldStick()).ahead).toBeCloseTo(0)
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 0, y: -100 })
  })

  it('dedo que já saiu e dedo desconhecido não mexem em nada', () => {
    const router = createTouchRouter()
    router.down(2, { x: 600, y: 200 }, LAYOUT)
    router.up(2)
    router.move(2, { x: 700, y: 200 })
    router.move(9, { x: 700, y: 200 })
    router.up(9)
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('soltar o dedo da mira libera a metade direita para outro', () => {
    const router = createTouchRouter()
    router.down(2, { x: 600, y: 200 }, LAYOUT)
    router.up(2)
    expect(router.down(3, { x: 600, y: 200 }, LAYOUT)).toBe('look')
  })

  it('reset solta os dois dedos e descarta a mira pendente', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, LAYOUT)
    router.down(2, { x: 600, y: 200 }, LAYOUT)
    router.move(2, { x: 650, y: 200 })
    router.reset()
    expect(router.stickOrigin()).toBeUndefined()
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(router.down(3, { x: 100, y: 300 }, LAYOUT)).toBe('move')
  })
})

describe('writeMove', () => {
  it('com polegar, escreve o analógico e corre no fim do curso para a frente', () => {
    const router = createTouchRouter()
    const stick = createHeldStick()
    const keys = { sprint: false }
    router.down(1, { x: 100, y: 300 }, LAYOUT)
    router.move(1, { x: BASE.x, y: BASE.y - R })
    router.writeMove(stick, keys)
    expect([stick.ahead, keys.sprint]).toEqual([1, true])
  })

  it('o polegar que sai zera uma vez, e depois não escreve mais', () => {
    const router = createTouchRouter()
    const stick = createHeldStick()
    const keys = { sprint: false }
    router.down(1, { x: 100, y: 300 }, LAYOUT)
    router.move(1, { x: BASE.x, y: BASE.y - R })
    router.writeMove(stick, keys)
    router.up(1)
    router.writeMove(stick, keys)
    expect([stick.ahead + 0, keys.sprint]).toEqual([0, false])
    // o controle conectado escreve, e o toque parado não apaga.
    stick.ahead = 0.5
    router.writeMove(stick, keys)
    expect(stick.ahead).toBe(0.5)
  })
})

describe('isSprintPush', () => {
  it('corre só no fim do curso para a frente', () => {
    expect(isSprintPush({ ahead: 0.97, side: 0.1 })).toBe(true)
    expect(isSprintPush({ ahead: 0.6, side: 0 })).toBe(false)
    expect(isSprintPush({ ahead: -1, side: 0 })).toBe(false)
  })
})
