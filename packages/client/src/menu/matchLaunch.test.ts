import { describe, expect, it } from 'vitest'
import { createMenuState } from './mainMenuModel.ts'
import { arenaReloadOf, matchLaunchOf } from './matchLaunch.ts'
import { QUICK_MATCH } from './matchSetup.ts'

const state = createMenuState({
  match: { ...QUICK_MATCH, bots: 1, difficulty: 2 },
  loadout: {
    primary: 0,
    melee: 1,
    sniperFinish: 1,
    katanaFinish: 0,
    knifeFinish: 2,
    characterSkin: 0,
  },
})

describe('matchLaunchOf', () => {
  it('a partida rápida ignora a nova partida: sala cheia e nível normal', () => {
    expect(matchLaunchOf('deploy', state)).toMatchObject({
      mode: 'match',
      rules: { botCount: 3, botDifficulty: 'normal' },
    })
  })

  it('o COMEÇAR usa a escolha da nova partida', () => {
    expect(matchLaunchOf('deploy-match', state).rules).toMatchObject({
      botCount: 1,
      botDifficulty: 'hard',
    })
  })

  it('o treino é treino, e a classe vale em toda entrada', () => {
    const launch = matchLaunchOf('train', state)
    expect(launch.mode).toBe('training')
    expect(launch.rules.meleeWeapon).toBe('knife')
    expect([launch.looks.sniper.id, launch.looks.blade.id]).toEqual(['grafite-neon', 'ouro'])
  })

  it('o nome de perfil entra na partida, e sem nome entra o padrão', () => {
    expect(matchLaunchOf('deploy', state).rules.callsign).toBe('AGENTE')
    const named = createMenuState({ profileName: 'raiden' })
    expect(matchLaunchOf('train', named).rules.callsign).toBe('RAIDEN')
  })
})

describe('arenaReloadOf', () => {
  const ichiban = createMenuState({ match: { ...QUICK_MATCH, arena: 1 }, loadout: state.loadout })

  it('o COMEÇAR num mapa diferente do montado recarrega já pedindo a entrada', () => {
    // regressão: recarregar só com o mapa abria o menu de sempre, e a partida
    // rápida dali jogava a QUICK_MATCH, não os bots escolhidos.
    expect(arenaReloadOf('deploy-match', ichiban, 'neon-kaido')).toEqual({
      arenaId: 'ichiban-gai',
      action: 'deploy-match',
    })
  })

  it('o COMEÇAR no mapa montado entra direto', () => {
    expect(arenaReloadOf('deploy-match', ichiban, 'ichiban-gai')).toBeNull()
  })

  it('a partida rápida joga no mapa que está na tela', () => {
    expect(arenaReloadOf('deploy', ichiban, 'neon-kaido')).toBeNull()
  })
})
