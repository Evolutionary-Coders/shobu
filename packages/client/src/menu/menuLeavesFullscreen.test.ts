import { describe, expect, it } from 'vitest'
import { menuLeavesFullscreen } from './menuLeavesFullscreen.ts'

describe('menuLeavesFullscreen', () => {
  it('o ESC do teclado na raiz sai da tela cheia', () => {
    expect(menuLeavesFullscreen('back', 'root', 'keyboard')).toBe(true)
  })

  it('o ESC numa tela de dentro só volta à raiz', () => {
    expect(menuLeavesFullscreen('back', 'settings', 'keyboard')).toBe(false)
  })

  it('o B do controle e o toque não saem', () => {
    expect(menuLeavesFullscreen('back', 'root', 'gamepad')).toBe(false)
    expect(menuLeavesFullscreen('back', 'root', 'touch')).toBe(false)
  })

  it('outro comando na raiz não sai', () => {
    expect(menuLeavesFullscreen('activate', 'root', 'keyboard')).toBe(false)
  })
})
