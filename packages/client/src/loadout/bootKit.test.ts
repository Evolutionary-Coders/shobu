import { describe, expect, it } from 'vitest'
import { bootKitOf } from './bootKit.ts'
import { parseClassLoadout } from './classLoadout.ts'

describe('bootKitOf', () => {
  it('a classe padrão sobe a Ronin, a katana e a sniper laser', () => {
    expect(bootKitOf(parseClassLoadout(null))).toEqual({
      playerSkin: 'ronin',
      meleeWeapon: 'katana',
      primaryWeapon: 'laser',
    })
  })

  /** A clássica é a segunda opção da ARMA PRINCIPAL: o boot baixa o modelo dela, não o da laser. */
  it('quem guardou a clássica sobe com ela', () => {
    const loadout = { ...parseClassLoadout(null), primary: 1, melee: 1 }
    expect(bootKitOf(loadout)).toMatchObject({ meleeWeapon: 'knife', primaryWeapon: 'classic' })
  })
})
