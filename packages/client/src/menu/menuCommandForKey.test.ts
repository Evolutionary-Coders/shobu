import { describe, expect, it } from 'vitest'
import { acceptsRepeat, menuCommandForKey } from './menuCommandForKey.ts'

describe('menuCommandForKey', () => {
  it.each([
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
    ['Enter', 'activate'],
    ['Space', 'activate'],
    ['Escape', 'back'],
  ])('%s vira %s', (code, command) => {
    expect(menuCommandForKey(code)).toBe(command)
  })

  /** A mão do jogador de fps já está no wasd, e menu e jogo nunca vivem juntos. */
  it.each([
    ['KeyW', 'up'],
    ['KeyS', 'down'],
    ['KeyA', 'left'],
    ['KeyD', 'right'],
  ])('%s também navega, como no jogo', (code, command) => {
    expect(menuCommandForKey(code)).toBe(command)
  })

  /**
   * O oposto do comportamento antigo, em que **qualquer** tecla entrava no jogo.
   * Tecla não mapeada tem que ser inerte, senão F5 e devtools viram deploy.
   */
  it.each(['KeyQ', 'F5', 'Tab', 'ShiftLeft', 'F12'])('%s não é comando de menu', (code) => {
    expect(menuCommandForKey(code)).toBeUndefined()
  })
})

describe('acceptsRepeat', () => {
  it.each(['up', 'down', 'left', 'right'] as const)('%s aceita tecla presa', (command) => {
    expect(acceptsRepeat(command)).toBe(true)
  })

  it.each(['activate', 'back'] as const)('%s recusa tecla presa', (command) => {
    expect(acceptsRepeat(command)).toBe(false)
  })
})
