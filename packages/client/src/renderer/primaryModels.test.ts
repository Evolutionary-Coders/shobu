import { PRIMARY_WEAPONS, type PrimaryWeapon } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { BOT_RIFLE_URLS, shownPrimary, VIEWMODEL_URLS } from './primaryModels.ts'

describe('shownPrimary', () => {
  it('a escolhida aparece assim que chega', () => {
    expect(shownPrimary('classic', new Set<PrimaryWeapon>(['laser', 'classic']))).toBe('classic')
  })

  /** Trocar de arma no menu não pode deixar a mão vazia durante o download. */
  it('enquanto a escolhida baixa, a que já chegou fica na mão', () => {
    expect(shownPrimary('classic', new Set<PrimaryWeapon>(['laser']))).toBe('laser')
    expect(shownPrimary('laser', new Set<PrimaryWeapon>(['classic']))).toBe('classic')
  })

  it('antes de qualquer glb, nenhuma', () => {
    expect(shownPrimary('laser', new Set())).toBeUndefined()
  })
})

describe('os modelos de cada arma principal', () => {
  /** A clássica continua no arquivo de sempre: os testes de glb e os créditos apontam para ele. */
  it('a clássica é a sniper e o rifle de sempre', () => {
    expect([VIEWMODEL_URLS.classic, BOT_RIFLE_URLS.classic]).toEqual([
      '/assets/viewmodel/sniper.glb',
      '/assets/character/bot-rifle.glb',
    ])
  })

  it('cada arma tem um modelo próprio, em primeira e em terceira pessoa', () => {
    const urls = PRIMARY_WEAPONS.flatMap((weapon) => [
      VIEWMODEL_URLS[weapon],
      BOT_RIFLE_URLS[weapon],
    ])
    expect(new Set(urls).size).toBe(PRIMARY_WEAPONS.length * 2)
  })
})
