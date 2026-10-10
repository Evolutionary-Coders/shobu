import { describe, expect, it } from 'vitest'
import { createHeldStick } from './heldStick.ts'
import { createTouchRouter, isSprintPush, TOUCH_STICK_RADIUS_PX } from './touchRouter.ts'

const WIDTH = 844
const R = TOUCH_STICK_RADIUS_PX

describe('createTouchRouter', () => {
  it('a metade esquerda anda, a direita mira', () => {
    const router = createTouchRouter()
    expect(router.down(1, { x: 100, y: 300 }, WIDTH)).toBe('move')
    expect(router.down(2, { x: 700, y: 200 }, WIDTH)).toBe('look')
  })

  it('o terceiro dedo, em qualquer metade, não manda em nada', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, WIDTH)
    router.down(2, { x: 700, y: 200 }, WIDTH)
    expect(router.down(3, { x: 50, y: 50 }, WIDTH)).toBe('none')
    expect(router.down(4, { x: 800, y: 50 }, WIDTH)).toBe('none')
  })

  it('o analógico nasce onde o polegar encosta', () => {
    const router = createTouchRouter()
    router.down(1, { x: 120, y: 280 }, WIDTH)
    expect(router.stickOrigin()).toEqual({ x: 120, y: 280 })
    router.move(1, { x: 120, y: 280 - R })
    expect(router.readStick(createHeldStick())).toEqual({ ahead: 1, side: 0 })
  })

  it('arrastar além do raio não passa do fim do curso', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, WIDTH)
    router.move(1, { x: 100 + R * 3, y: 300 })
    const stick = router.readStick(createHeldStick())
    expect(stick.side).toBeCloseTo(1)
  })

  it('soltar o polegar para o personagem', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, WIDTH)
    router.move(1, { x: 100, y: 200 })
    router.up(1)
    expect(router.readStick(createHeldStick())).toEqual({ ahead: 0, side: 0 })
    expect(router.stickOrigin()).toBeUndefined()
  })

  it('a mira acumula o arrasto e zera ao ser lida', () => {
    const router = createTouchRouter()
    router.down(2, { x: 600, y: 200 }, WIDTH)
    router.move(2, { x: 610, y: 195 })
    router.move(2, { x: 625, y: 190 })
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 25, y: -10 })
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('o dedo que anda não mira, e o que mira não anda', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, WIDTH)
    router.down(2, { x: 600, y: 200 }, WIDTH)
    router.move(2, { x: 600, y: 100 })
    router.move(1, { x: 140, y: 300 })
    expect(router.readStick(createHeldStick()).ahead).toBeCloseTo(0)
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 0, y: -100 })
  })

  it('dedo que já saiu e dedo desconhecido não mexem em nada', () => {
    const router = createTouchRouter()
    router.down(2, { x: 600, y: 200 }, WIDTH)
    router.up(2)
    router.move(2, { x: 700, y: 200 })
    router.move(9, { x: 700, y: 200 })
    router.up(9)
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('soltar o dedo da mira libera a metade direita para outro', () => {
    const router = createTouchRouter()
    router.down(2, { x: 600, y: 200 }, WIDTH)
    router.up(2)
    expect(router.down(3, { x: 600, y: 200 }, WIDTH)).toBe('look')
  })

  it('reset solta os dois dedos e descarta a mira pendente', () => {
    const router = createTouchRouter()
    router.down(1, { x: 100, y: 300 }, WIDTH)
    router.down(2, { x: 600, y: 200 }, WIDTH)
    router.move(2, { x: 650, y: 200 })
    router.reset()
    expect(router.stickOrigin()).toBeUndefined()
    expect(router.takeLook({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
    expect(router.down(3, { x: 100, y: 300 }, WIDTH)).toBe('move')
  })
})

describe('isSprintPush', () => {
  it('corre só no fim do curso para a frente', () => {
    expect(isSprintPush({ ahead: 0.97, side: 0.1 })).toBe(true)
    expect(isSprintPush({ ahead: 0.6, side: 0 })).toBe(false)
    expect(isSprintPush({ ahead: -1, side: 0 })).toBe(false)
  })
})
