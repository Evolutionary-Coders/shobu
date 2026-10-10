import { describe, expect, it } from 'vitest'
import { arenaEntryFor } from './arenaEntry.ts'

describe('arenaEntryFor', () => {
  it('VR EXPERIMENTAL entra pelo óculos, venha de onde vier', () => {
    expect(arenaEntryFor('deploy-headset', 'keyboard')).toBe('headset')
    expect(arenaEntryFor('deploy-headset', 'gamepad')).toBe('headset')
  })

  it('confirmado pelo controle, joga pelo controle', () => {
    expect(arenaEntryFor('deploy', 'gamepad')).toBe('gamepad')
    expect(arenaEntryFor('train', 'gamepad')).toBe('gamepad')
  })

  it('pelo teclado ou mouse, trava o ponteiro', () => {
    expect(arenaEntryFor('deploy', 'keyboard')).toBe('pointer')
  })
})
