import { describe, expect, it } from 'vitest'
import { choiceOf, openVoteBooth } from './mapVoteBooth.ts'
import {
  applyVoteCommand,
  MOUSE_FOCUS_STEP_PX,
  mouseFocusSteps,
  voteCommandForKey,
  voteCommandForMenu,
} from './voteCommands.ts'

const ARENAS = [
  { id: 'neon-kaido', label: 'NEON-KAIDŌ' },
  { id: 'ichiban-gai', label: 'ICHIBAN-GAI' },
]

describe('voteCommandForKey', () => {
  it.each([
    ['Digit1', { kind: 'vote', index: 0 }],
    ['Numpad3', { kind: 'vote', index: 2 }],
    ['ArrowLeft', { kind: 'focus', step: -1 }],
    ['KeyD', { kind: 'focus', step: 1 }],
    ['Enter', { kind: 'vote-focused' }],
    ['Escape', { kind: 'leave' }],
  ])('%s', (code, command) => {
    expect(voteCommandForKey(code)).toEqual(command)
  })

  it('o resto do teclado não faz nada', () => {
    expect(voteCommandForKey('KeyQ')).toBeUndefined()
    expect(voteCommandForKey('Digit0')).toBeUndefined()
  })
})

describe('voteCommandForMenu', () => {
  it('o d-pad anda, o A vota, o B volta ao menu', () => {
    expect(voteCommandForMenu('right')).toEqual({ kind: 'focus', step: 1 })
    expect(voteCommandForMenu('up')).toEqual({ kind: 'focus', step: -1 })
    expect(voteCommandForMenu('activate')).toEqual({ kind: 'vote-focused' })
    expect(voteCommandForMenu('back')).toEqual({ kind: 'leave' })
  })
})

describe('mouseFocusSteps', () => {
  it('acumula até o passo, e guarda o que sobra', () => {
    expect(mouseFocusSteps(0, 60)).toEqual({ steps: 0, remainderPx: 60 })
    expect(mouseFocusSteps(100, 60)).toEqual({ steps: 1, remainderPx: 160 - MOUSE_FOCUS_STEP_PX })
  })

  it('anda para os dois lados', () => {
    expect(mouseFocusSteps(-100, -200).steps).toBe(-2)
  })
})

describe('applyVoteCommand', () => {
  it('anda o foco e vota nele', () => {
    const booth = openVoteBooth(ARENAS, [], 1)
    expect(applyVoteCommand(booth, { kind: 'focus', step: 1 }, 'local', 1)).toBe(false)
    applyVoteCommand(booth, { kind: 'vote-focused' }, 'local', 1)
    expect(choiceOf(booth, 'local')).toBe(1)
  })

  it('vota direto pelo número', () => {
    const booth = openVoteBooth(ARENAS, [], 1)
    applyVoteCommand(booth, { kind: 'vote', index: 2 }, 'local', 1)
    expect(choiceOf(booth, 'local')).toBe(2)
  })

  it('voltar ao menu é com quem chamou', () => {
    expect(applyVoteCommand(openVoteBooth(ARENAS, [], 1), { kind: 'leave' }, 'local', 1)).toBe(true)
  })
})
