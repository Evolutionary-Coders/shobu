import { describe, expect, it } from 'vitest'
import { createMemorySettingsStorage } from '../settings/jsonStore.ts'
import { createFairUserStore, FAIR_USER_KEY } from './fairUserStore.ts'

function storeWith(raw?: string) {
  const storage = createMemorySettingsStorage()
  if (raw !== undefined) storage.setItem(FAIR_USER_KEY, raw)
  return { storage, store: createFairUserStore(storage) }
}

describe('createFairUserStore', () => {
  it('nada guardado é escolha por fazer', () => {
    expect(storeWith().store.read()).toBeUndefined()
  })

  it('guarda e lê o ID', () => {
    const { store } = storeWith()
    store.write(42)
    expect(store.read()).toBe(42)
  })

  it('guarda a escolha de jogar sem ID, diferente de nada guardado', () => {
    const { store } = storeWith()
    store.write(null)
    expect(store.read()).toBeNull()
  })

  it('esquecer volta a escolha por fazer', () => {
    const { store } = storeWith()
    store.write(42)
    store.forget()
    expect(store.read()).toBeUndefined()
  })

  it.each([
    ['json quebrado', '{'],
    ['número solto', '42'],
    ['sem o campo', '{}'],
    ['ID fora de forma', '{"userId":-1}'],
  ])('%s é escolha por fazer', (_case, raw) => {
    expect(storeWith(raw).store.read()).toBeUndefined()
  })
})
