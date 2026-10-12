import { createKillEvent } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  copyKillNotice,
  createKillLog,
  createKillNotice,
  createTracerLog,
  nextSlot,
  noteKill,
  noteTracer,
} from './arenaFrameLog.ts'

/** A linha do headshot do teste: qualquer número da faixa do config serve. */
const HEAD = 0.82

describe('o registro do quadro', () => {
  it('anota kills em ordem, nos slots pré-alocados', () => {
    const log = createKillLog(2)
    noteKill(log, { ...createKillEvent(), shooterId: 'bot-0', victimId: 'local' }, HEAD)
    noteKill(log, { ...createKillEvent(), shooterId: 'local', victimId: 'bot-1' }, HEAD)
    expect(log.count).toBe(2)
    expect(log.slots).toEqual([
      { ...createKillNotice(), shooterId: 'bot-0', victimId: 'local' },
      { ...createKillNotice(), shooterId: 'local', victimId: 'bot-1' },
    ])
  })

  /** Cheio é perder a anotação, não o jogo: a kill já está no placar. */
  it('cheio, descarta a anotação nova sem lançar', () => {
    const log = createKillLog(1)
    noteKill(log, { ...createKillEvent(), shooterId: 'bot-0', victimId: 'local' }, HEAD)
    noteKill(log, { ...createKillEvent(), shooterId: 'bot-1', victimId: 'bot-2' }, HEAD)
    expect(log.count).toBe(1)
    expect(log.slots[0]?.victimId).toBe('local')
    expect(nextSlot(log)).toBeUndefined()
  })

  /** O killfeed desenha cada um destes como ícone, e a tela de morte os conta. */
  it('copia como a kill aconteceu, com o headshot pela regra da medalha', () => {
    const into = createKillNotice()
    copyKillNotice(
      into,
      {
        ...createKillEvent(),
        shooterId: 'bot-2',
        victimId: 'local',
        weapon: 'katana',
        scoped: true,
        distanceM: 87.5,
        shooterAirborne: true,
        victimAirborne: true,
        shooterGrappling: true,
        hitHeightRatio: 0.9,
      },
      HEAD,
    )
    expect(into).toEqual({
      shooterId: 'bot-2',
      victimId: 'local',
      weapon: 'katana',
      headshot: true,
      scoped: true,
      distanceM: 87.5,
      shooterAirborne: true,
      victimAirborne: true,
      shooterGrappling: true,
    })
    copyKillNotice(into, { ...createKillEvent(), hitHeightRatio: 0.5 }, HEAD)
    expect(into.headshot).toBe(false)
  })

  it('anota o rastro copiando os pontos, sem guardar a referência', () => {
    const log = createTracerLog(1)
    const from = { x: 1, y: 2, z: 3 }
    noteTracer(log, 2, from, { x: 4, y: 5, z: 6 }, true)
    from.x = 99
    expect(log.slots[0]).toEqual({
      botIndex: 2,
      fromM: { x: 1, y: 2, z: 3 },
      toM: { x: 4, y: 5, z: 6 },
      hitFighter: true,
    })
    noteTracer(log, 1, from, from, false)
    expect(log.count).toBe(1)
  })

  it.each([0, -1, 1.5])('recusa capacidade %s', (capacity) => {
    expect(() => createTracerLog(capacity)).toThrow(/esperado inteiro >= 1/)
  })
})
