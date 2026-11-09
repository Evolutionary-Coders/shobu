import type { CosmeticLoadoutMessage } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { parseClassLoadout } from '../loadout/classLoadout.ts'
import { announceMenuLook, cosmeticLoadoutOf } from './menuLook.ts'

/** A porta de rede, só com o visual: guarda o que recebeu. */
class FakeCosmeticPort {
  readonly looks: CosmeticLoadoutMessage[] = []

  chooseCosmetics(look: CosmeticLoadoutMessage): void {
    this.looks.push(look)
  }
}

describe('cosmeticLoadoutOf', () => {
  it('sem escolha, é a skin padrão e o primeiro acabamento', () => {
    expect(cosmeticLoadoutOf(parseClassLoadout(null))).toEqual({
      characterSkin: 'ronin',
      sniperFinish: 'preta',
    })
  })

  it('leva o id do acabamento, e não o índice', () => {
    const loadout = parseClassLoadout({ sniperFinish: 2, characterSkin: 1 })
    expect(cosmeticLoadoutOf(loadout)).toEqual({ characterSkin: 'brick', sniperFinish: 'carbono' })
  })
})

describe('announceMenuLook', () => {
  /** Regressão do playtest: a skin escolhida nunca saía do navegador. */
  it('manda à sala o visual da classe guardada', () => {
    const port = new FakeCosmeticPort()
    announceMenuLook(port, parseClassLoadout({ sniperFinish: 1 }))
    expect(port.looks).toEqual([{ characterSkin: 'ronin', sniperFinish: 'kage' }])
  })
})
