import { describe, expect, it } from 'vitest'
import { dot, normalizeInPlace } from '../math/vector3.ts'
import {
  aimOnWire,
  decodeButtons,
  decodeMovementInput,
  decodeStance,
  dequantizeAim,
  dequantizePositionM,
  encodeButtons,
  encodeStance,
  type MutableWireAim,
  quantizeAim,
  quantizePositionM,
  quantizeWish,
  type WireButtons,
  type WireInput,
  wishOnWire,
} from './wireFormat.ts'

function emptyAim(): MutableWireAim {
  return { aimX: 0, aimY: 0, aimZ: 0 }
}

const NO_BUTTONS: WireButtons = {
  sprint: false,
  jump: false,
  crouch: false,
  fire: false,
  scope: false,
  reload: false,
}

describe('posição', () => {
  /** A resolução é o que a docs/rede promete: 200 vezes abaixo do critério de 0,10 m. */
  it('volta com erro de no máximo meio milímetro', () => {
    for (const meters of [0, 0.0004, -12.3456, 31.9999, 14.5]) {
      expect(Math.abs(dequantizePositionM(quantizePositionM(meters)) - meters)).toBeLessThanOrEqual(
        0.0005,
      )
    }
  })

  it('cabe em int16 e satura fora de ±32,767 m em vez de dar a volta', () => {
    expect(quantizePositionM(40)).toBe(32767)
    expect(quantizePositionM(-40)).toBe(-32768)
  })

  it('recusa posição que não é número finito, dizendo qual', () => {
    expect(() => quantizePositionM(Number.NaN)).toThrow(/NaN/)
  })
})

describe('mira', () => {
  it('volta unitária e a menos de 0,002° da original', () => {
    const aim = normalizeInPlace({ x: 0.3, y: -0.2, z: -0.93 })
    const back = dequantizeAim(quantizeAim(aim, emptyAim()), { x: 0, y: 0, z: 0 })
    expect(Math.hypot(back.x, back.y, back.z)).toBeCloseTo(1, 12)
    const angleDeg = (Math.acos(Math.min(1, dot(aim, back))) * 180) / Math.PI
    expect(angleDeg).toBeLessThan(0.002)
  })

  it('não precisa vir unitária', () => {
    expect(quantizeAim({ x: 0, y: 0, z: -5 }, emptyAim())).toEqual({
      aimX: 0,
      aimY: 0,
      aimZ: -32767,
    })
  })

  it('recusa mira infinita, dizendo qual', () => {
    expect(() => quantizeAim({ x: Number.POSITIVE_INFINITY, y: 0, z: 0 }, emptyAim())).toThrow(
      /Infinity/,
    )
  })

  it('escreve no objeto que recebe, sem alocar outro', () => {
    const out = emptyAim()
    expect(quantizeAim({ x: 1, y: 0, z: 0 }, out)).toBe(out)
  })

  it('recusa mira nula, dizendo qual', () => {
    expect(() => quantizeAim({ x: 0, y: 0, z: 0 }, emptyAim())).toThrow(/0, 0, 0/)
  })
})

describe('aimOnWire', () => {
  it('é a mira que o servidor decodifica do fio', () => {
    const aim = { x: 0.3, y: -0.2, z: -0.93 }
    const expected = dequantizeAim(quantizeAim(aim, emptyAim()), { x: 0, y: 0, z: 0 })
    expect(aimOnWire(aim, { x: 0, y: 0, z: 0 })).toEqual(expected)
  })
})

describe('direção desejada', () => {
  it('ocupa int8 e satura acima de 1', () => {
    expect(quantizeWish(1)).toBe(127)
    expect(quantizeWish(-3)).toBe(-127)
    expect(quantizeWish(0.5)).toBe(64)
  })
})

describe('wishOnWire', () => {
  it('é o valor que o servidor decodifica do fio', () => {
    for (const axis of [0, 1, -1, Math.SQRT1_2, 0.3141592, -0.9999]) {
      const wire: WireInput = {
        wishX: quantizeWish(axis),
        wishZ: 0,
        buttons: 0,
        aimX: 0,
        aimY: 0,
        aimZ: -32767,
      }
      expect(wishOnWire(axis)).toBe(decodeMovementInput(wire, false).wishX)
    }
  })
})

describe('botões', () => {
  it('cabem num byte e voltam iguais, um a um', () => {
    for (const name of Object.keys(NO_BUTTONS) as (keyof WireButtons)[]) {
      const pressed = { ...NO_BUTTONS, [name]: true }
      const bits = encodeButtons(pressed)
      expect(bits).toBeLessThan(256)
      expect(decodeButtons(bits)).toEqual(pressed)
    }
  })
})

describe('postura', () => {
  it.each([
    ['standing', true],
    ['crouching', false],
    ['sliding', true],
  ] as const)('%s, no chão %s, volta igual', (stance, grounded) => {
    expect(decodeStance(encodeStance(stance, grounded))).toEqual({ stance, grounded })
  })

  it('recusa byte que não é postura, dizendo qual', () => {
    expect(() => decodeStance(3)).toThrow(/3/)
  })
})

describe('decodeMovementInput', () => {
  const wire: WireInput = {
    wishX: 127,
    wishZ: -64,
    buttons: encodeButtons({ ...NO_BUTTONS, sprint: true, jump: true }),
    aimX: 0,
    aimY: 0,
    aimZ: -32767,
  }

  it('devolve a direção desejada em -1..1 e os botões de movimento', () => {
    const input = decodeMovementInput(wire, false)
    expect(input.wishX).toBe(1)
    expect(input.wishZ).toBeCloseTo(-64 / 127, 12)
    expect(input).toMatchObject({ sprint: true, jump: true, crouch: false, scoped: false })
  })

  /** A mira aberta vem do estado da arma, não do botão cru (ver `MovementInput.scoped`). */
  it('usa o scoped que recebe, não o botão de mira', () => {
    const scopeHeld = { ...wire, buttons: encodeButtons({ ...NO_BUTTONS, scope: true }) }
    expect(decodeMovementInput(scopeHeld, false).scoped).toBe(false)
    expect(decodeMovementInput(wire, true).scoped).toBe(true)
  })
})
