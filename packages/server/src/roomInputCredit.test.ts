import { describe, expect, it } from 'vitest'
import { duel, FORWARD_WIRE, open, seat, wire } from './roomDuelFixture.ts'
import { STANDING_BACKLOG_WINDOW_TICKS } from './roomInputBacklog.ts'
import { INPUT_CREDIT_CAP, stepRoom } from './roomSimulation.ts'

describe('stepRoom, o crédito e o atraso de input', () => {
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

  /**
   * Regressão: o servidor parado 700 ms deixava 36 a 40 inputs na fila de quem
   * seguia mandando um por tick, e o ping ficava em 650 ms até o fim da partida.
   */
  it('esvazia o atraso que um soluço maior que o balde deixou na fila', () => {
    const { room, io } = duel()
    const tickWithInput = (count: number) => {
      io.push('ana', FORWARD_WIRE, count)
      stepRoom(room, io, open)
    }
    for (let tick = 0; tick < 10; tick += 1) tickWithInput(1)
    tickWithInput(42)
    for (let tick = 0; tick < STANDING_BACKLOG_WINDOW_TICKS * 2; tick += 1) tickWithInput(1)
    expect(io.remaining('ana')).toBe(0)
    expect(io.discarded).toEqual(['ana:41'])
  })

  /** A rajada de um quadro lento sai pelo crédito guardado, e nada dela vai fora. */
  it('não joga fora a rajada de um cliente a 10 FPS', () => {
    const { room, io } = duel()
    for (let tick = 0; tick < 6; tick += 1) stepRoom(room, io, open)
    for (let tick = 0; tick < STANDING_BACKLOG_WINDOW_TICKS * 4; tick += 1) {
      if (tick % 6 === 0) io.push('ana', FORWARD_WIRE, 6)
      stepRoom(room, io, open)
    }
    expect(io.discarded).toEqual([])
  })

  /** Jogar fora, e não aplicar: quem manda dois inputs por tick anda o mesmo que quem manda um. */
  it('não deixa o cliente que manda inputs a mais andar mais rápido', () => {
    const sideways = wire({}, { wishX: 127 })
    const xAfter = (perTick: number) => {
      const { room, io } = duel()
      for (let tick = 0; tick < STANDING_BACKLOG_WINDOW_TICKS * 3; tick += 1) {
        io.push('ana', sideways, perTick)
        stepRoom(room, io, open)
      }
      return seat(room, 'ana').body.position.x
    }
    expect(xAfter(2)).toBe(xAfter(1))
  })

  it('guarda a mira do último input, e é para lá que o lutador olha', () => {
    const { room, io } = duel()
    io.push('ana', wire({}, { aimX: 32767, aimZ: 0 }))
    stepRoom(room, io, open)
    expect(seat(room, 'ana').aim).toEqual({ aimX: 32767, aimY: 0, aimZ: 0 })
    expect(seat(room, 'ana').fighter.facingM).toEqual({ x: 1, y: 0, z: 0 })
  })
})
