import { describe, expect, it } from 'vitest'
import { duel, FORWARD_WIRE, open, seat, wire } from './roomDuelFixture.ts'
import { INPUT_CREDIT_CAP, stepRoom } from './roomSimulation.ts'

describe('stepRoom, o crédito de input', () => {
  it('aplica um input no primeiro tick, com um crédito só', () => {
    const { room, io } = duel()
    const ana = seat(room, 'ana')
    io.push('ana', FORWARD_WIRE, 2)
    const startZ = ana.body.position.z
    stepRoom(room, io, open)
    expect(ana.body.position.z).toBeLessThan(startZ)
    expect(io.remaining('ana')).toBe(1)
  })

  /** Sem input, o servidor não inventa tick: é o que deixa a reconciliação do cliente fechar. */
  it('deixa parado quem não mandou input', () => {
    const { room, io } = duel()
    const before = { ...seat(room, 'ana').body.position }
    stepRoom(room, io, open)
    expect(seat(room, 'ana').body.position).toEqual(before)
  })

  it('recupera o atraso de um soluço de rede com o crédito guardado', () => {
    const { room, io } = duel()
    for (let tick = 0; tick < 3; tick += 1) stepRoom(room, io, open)
    io.push('ana', FORWARD_WIRE, 5)
    stepRoom(room, io, open)
    expect(io.remaining('ana')).toBe(1)
  })

  it('guarda no máximo INPUT_CREDIT_CAP créditos', () => {
    const { room, io } = duel()
    for (let tick = 0; tick < 20; tick += 1) stepRoom(room, io, open)
    io.push('ana', FORWARD_WIRE, 20)
    stepRoom(room, io, open)
    expect(io.remaining('ana')).toBe(20 - INPUT_CREDIT_CAP)
  })

  /** Um cliente adulterado que manda três inputs por tick não anda três vezes mais rápido. */
  it('não aplica mais de um input por tick na média', () => {
    const { room, io } = duel()
    for (let tick = 0; tick < 10; tick += 1) {
      io.push('ana', FORWARD_WIRE, 3)
      stepRoom(room, io, open)
    }
    expect(30 - io.remaining('ana')).toBe(10)
  })

  it('guarda a mira do último input, e é para lá que o lutador olha', () => {
    const { room, io } = duel()
    io.push('ana', wire({}, { aimX: 32767, aimZ: 0 }))
    stepRoom(room, io, open)
    expect(seat(room, 'ana').aim).toEqual({ aimX: 32767, aimY: 0, aimZ: 0 })
    expect(seat(room, 'ana').fighter.facingM).toEqual({ x: 1, y: 0, z: 0 })
  })
})
