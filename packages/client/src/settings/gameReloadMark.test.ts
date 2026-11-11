import { describe, expect, it } from 'vitest'
import { GAME_RELOAD_KEY, markGameReload, takeGameReload } from './gameReloadMark.ts'
import { createMemorySettingsStorage } from './jsonStore.ts'

describe('gameReloadMark', () => {
  it('a página aberta pela pessoa não tem marca', () => {
    expect(takeGameReload(createMemorySettingsStorage())).toBe(false)
  })

  it('a recarga marcada é lida uma vez só', () => {
    const storage = createMemorySettingsStorage()
    markGameReload(storage)
    expect(takeGameReload(storage)).toBe(true)
    expect(takeGameReload(storage)).toBe(false)
  })

  it('marca quebrada não vale', () => {
    const storage = createMemorySettingsStorage()
    storage.setItem(GAME_RELOAD_KEY, '"sim"')
    expect(takeGameReload(storage)).toBe(false)
  })
})
