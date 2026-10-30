import { describe, expect, it } from 'vitest'
import { createMemorySettingsStorage } from '../settings/jsonStore.ts'
import { characterSkinAt } from './characterSkins.ts'
import {
  CLASS_LOADOUT_KEY,
  CLASS_LOADOUT_SPEC,
  classKitOf,
  createClassLoadoutStore,
  parseClassLoadout,
} from './classLoadout.ts'

describe('classLoadout', () => {
  it('a classe padrão: sniper laser preta, katana, Ronin', () => {
    const kit = classKitOf(parseClassLoadout(null))
    expect(kit.primaryWeapon).toBe('laser')
    expect(kit.meleeWeapon).toBe('katana')
    expect(kit.sniperFinish.id).toBe('preta')
    expect(kit.bladeFinish.id).toBe('neon')
    expect(kit.characterSkinId).toBe('ronin')
  })

  it('a lâmina da classe leva o acabamento dela, e o da outra fica guardado', () => {
    const loadout = { ...parseClassLoadout(null), melee: 1, katanaFinish: 2, knifeFinish: 1 }
    expect(classKitOf(loadout)).toMatchObject({ meleeWeapon: 'knife' })
    expect(classKitOf(loadout).bladeFinish.id).toBe('aco')
    expect(classKitOf({ ...loadout, melee: 0 }).bladeFinish.id).toBe('ouro')
  })

  it('índice de corpo a corpo que não existe volta à katana', () => {
    expect(classKitOf({ ...parseClassLoadout(null), melee: 7 }).meleeWeapon).toBe('katana')
  })

  it('a laser se chama HANABI LX-01 no menu, antes da SHB-96', () => {
    const primary = CLASS_LOADOUT_SPEC.find((spec) => spec.key === 'primary')
    expect(primary?.choices).toEqual(['HANABI LX-01', 'SNIPER SHB-96'])
  })

  it('a segunda arma principal é a SHB-96 clássica, e índice que não existe volta à laser', () => {
    expect(classKitOf({ ...parseClassLoadout(null), primary: 1 }).primaryWeapon).toBe('classic')
    expect(classKitOf({ ...parseClassLoadout(null), primary: 7 }).primaryWeapon).toBe('laser')
  })

  /** Sem migração: o 0 guardado de antes da laser era o padrão de uma linha travada. */
  it('lê como laser a classe guardada antes de a laser existir', () => {
    const storage = createMemorySettingsStorage()
    storage.setItem(CLASS_LOADOUT_KEY, JSON.stringify({ primary: 0, melee: 1 }))
    expect(classKitOf(createClassLoadoutStore(storage).read()).primaryWeapon).toBe('laser')
  })

  it('guarda a classe na chave dela', () => {
    const storage = createMemorySettingsStorage()
    const store = createClassLoadoutStore(storage)
    store.write({ ...store.read(), melee: 1 })
    expect(JSON.parse(storage.getItem(CLASS_LOADOUT_KEY) ?? '{}').melee).toBe(1)
    expect(store.read().melee).toBe(1)
  })

  it('a skin de personagem que não existe volta à padrão', () => {
    expect(characterSkinAt(9).id).toBe('ronin')
  })
})
