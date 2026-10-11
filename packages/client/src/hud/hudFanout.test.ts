import { describe, expect, it } from 'vitest'
import { type ArenaHud, createSilentHud } from './arenaHud.ts'
import { ARENA_HUD_METHODS, fanOutHud } from './hudFanout.ts'

/** Um hud que anota cada chamada, com os argumentos. */
class RecordingHud {
  readonly calls: [string, unknown[]][] = []

  asHud(): ArenaHud {
    const hud: Record<string, (...args: unknown[]) => void> = {}
    for (const name of ARENA_HUD_METHODS) {
      hud[name] = (...args) => void this.calls.push([name, args])
    }
    return hud as unknown as ArenaHud
  }
}

describe('fanOutHud', () => {
  it('a lista de métodos cobre a interface inteira do hud', () => {
    expect([...ARENA_HUD_METHODS].sort()).toEqual(Object.keys(createSilentHud()).sort())
  })

  it('repassa cada chamada, com os argumentos, a todos os huds', () => {
    const dom = new RecordingHud()
    const visor = new RecordingHud()
    const hud = fanOutHud([dom.asHud(), visor.asHud()])
    hud.setAmmo(4, 'cycling')
    hud.showKillPoints(100, ['DUPLA'])
    const expected = [
      ['setAmmo', [4, 'cycling']],
      ['showKillPoints', [100, ['DUPLA']]],
    ]
    expect(dom.calls).toEqual(expected)
    expect(visor.calls).toEqual(expected)
  })

  it('sem huds, nada acontece e nada quebra', () => {
    expect(() => fanOutHud([]).close()).not.toThrow()
  })
})
