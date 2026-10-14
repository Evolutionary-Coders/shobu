import { describe, expect, it } from 'vitest'
import { createMemorySettingsStorage } from './jsonStore.ts'
import {
  createProfileNameStore,
  DEFAULT_PROFILE_NAME,
  PROFILE_NAME_KEY,
  PROFILE_NAME_MAX,
  profileNameLabel,
  sanitizeProfileName,
  typedProfileName,
} from './profileName.ts'

describe('typedProfileName', () => {
  it('passa para caixa alta, com acento', () => {
    expect(typedProfileName('joão-ç_9')).toBe('JOÃO-Ç_9')
  })

  it('tira o que quebraria a linha do hud', () => {
    expect(typedProfileName('<neo>\n😀x!')).toBe('NEOX')
  })

  it('não começa com espaço nem junta dois, mas deixa o do fim de quem digita', () => {
    expect(typedProfileName('   neo    x ')).toBe('NEO X ')
  })

  it('corta no teto, contando ponto de código', () => {
    expect([...typedProfileName('Á'.repeat(PROFILE_NAME_MAX + 4))]).toHaveLength(PROFILE_NAME_MAX)
  })

  /** Teclado de celular manda o acento decomposto: "A" + "◌̃". */
  it('compõe o acento decomposto antes de contar', () => {
    expect(typedProfileName('joão')).toBe('JOÃO')
  })
})

describe('sanitizeProfileName', () => {
  it('é o digitado sem o espaço do fim', () => {
    expect(sanitizeProfileName('  raiden ')).toBe('RAIDEN')
  })

  it('o corte no teto não deixa espaço pendurado', () => {
    expect(sanitizeProfileName(`${'A'.repeat(PROFILE_NAME_MAX - 1)} B`)).toBe(
      'A'.repeat(PROFILE_NAME_MAX - 1),
    )
  })

  it.each([42, null, undefined, {}])('o que não é texto vira vazio: %s', (raw) => {
    expect(sanitizeProfileName(raw)).toBe('')
  })
})

describe('profileNameLabel', () => {
  it('sem nome, a tela escreve o padrão', () => {
    expect(profileNameLabel('')).toBe(DEFAULT_PROFILE_NAME)
    expect(profileNameLabel('  <> ')).toBe(DEFAULT_PROFILE_NAME)
  })

  it('com nome, escreve o nome limpo', () => {
    expect(profileNameLabel('kitsu')).toBe('KITSU')
  })
})

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
