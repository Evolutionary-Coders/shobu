import { describe, expect, it } from 'vitest'
import { arenaEntryFor, menuSourceOfClick } from './arenaEntry.ts'

describe('menuSourceOfClick', () => {
  it('o pointerType decide quando o navegador o entrega', () => {
    expect(menuSourceOfClick('touch', false)).toBe('touch')
    expect(menuSourceOfClick('mouse', true)).toBe('keyboard')
    expect(menuSourceOfClick('pen', false)).toBe('keyboard')
  })

  it('sem pointerType, o ponteiro grosso é dedo e o fino é mouse', () => {
    expect(menuSourceOfClick(undefined, true)).toBe('touch')
    expect(menuSourceOfClick(undefined, false)).toBe('keyboard')
  })
})

describe('arenaEntryFor', () => {
  it('VR EXPERIMENTAL entra pelo óculos, venha de onde vier', () => {
    expect(arenaEntryFor('deploy-headset', 'keyboard')).toBe('headset')
    expect(arenaEntryFor('deploy-headset', 'gamepad')).toBe('headset')
  })

  it('confirmado pelo controle, joga pelo controle', () => {
    expect(arenaEntryFor('deploy', 'gamepad')).toBe('gamepad')
    expect(arenaEntryFor('train', 'gamepad')).toBe('gamepad')
  })

  it('tocado com o dedo, joga pelo toque', () => {
    expect(arenaEntryFor('deploy', 'touch')).toBe('touch')
    expect(arenaEntryFor('deploy-headset', 'touch')).toBe('headset')
  })

  it('pelo teclado ou mouse, trava o ponteiro', () => {
    expect(arenaEntryFor('deploy', 'keyboard')).toBe('pointer')
  })
})
