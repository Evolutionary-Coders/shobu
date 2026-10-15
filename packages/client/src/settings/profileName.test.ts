import { describe, expect, it } from 'vitest'
import { createMemorySettingsStorage } from './jsonStore.ts'
import { createProfileNameStore, PROFILE_NAME_KEY } from './profileName.ts'

describe('createProfileNameStore', () => {
  it('guarda e lê o nome na chave própria', () => {
    const storage = createMemorySettingsStorage()
    const store = createProfileNameStore(storage)
    store.write('RAIDEN')
    expect(storage.getItem(PROFILE_NAME_KEY)).toBe('"RAIDEN"')
    expect(store.read()).toBe('RAIDEN')
  })

  it('o guardado sujo, editado à mão, sai limpo', () => {
    const storage = createMemorySettingsStorage()
    storage.setItem(PROFILE_NAME_KEY, JSON.stringify(' neo<script> '))
    expect(createProfileNameStore(storage).read()).toBe('NEOSCRIPT')
  })

  it('nada guardado é sem nome', () => {
    expect(createProfileNameStore(createMemorySettingsStorage()).read()).toBe('')
  })
})
