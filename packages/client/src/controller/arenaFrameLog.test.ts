import { describe, expect, it } from 'vitest'
import { createKillLog, createTracerLog, nextSlot, noteKill, noteTracer } from './arenaFrameLog.ts'

describe('o registro do quadro', () => {
  it('anota kills em ordem, nos slots pré-alocados', () => {
    const log = createKillLog(2)
    noteKill(log, 'bot-0', 'local')
    noteKill(log, 'local', 'bot-1')
    expect(log.count).toBe(2)
    expect(log.slots).toEqual([
      { shooterId: 'bot-0', victimId: 'local' },
      { shooterId: 'local', victimId: 'bot-1' },
    ])
  })

  /** Cheio é perder a anotação, não o jogo: a kill já está no placar. */
  it('cheio, descarta a anotação nova sem lançar', () => {
    const log = createKillLog(1)
    noteKill(log, 'bot-0', 'local')
    noteKill(log, 'bot-1', 'bot-2')
    expect(log.count).toBe(1)
    expect(log.slots[0]?.victimId).toBe('local')
    expect(nextSlot(log)).toBeUndefined()
  })

  it('anota o rastro copiando os pontos, sem guardar a referência', () => {
    const log = createTracerLog(1)
    const from = { x: 1, y: 2, z: 3 }
    noteTracer(log, 2, from, { x: 4, y: 5, z: 6 })
    from.x = 99
    expect(log.slots[0]).toEqual({
      botIndex: 2,
      fromM: { x: 1, y: 2, z: 3 },
      toM: { x: 4, y: 5, z: 6 },
    })
    noteTracer(log, 1, from, from)
    expect(log.count).toBe(1)
  })

  it.each([0, -1, 1.5])('recusa capacidade %s', (capacity) => {
    expect(() => createTracerLog(capacity)).toThrow(/esperado inteiro >= 1/)
  })
})
