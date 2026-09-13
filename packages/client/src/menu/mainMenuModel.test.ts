import { describe, expect, it } from 'vitest'
import { PLAYER_SETTING_KEYS } from '../settings/parsePlayerSettings.ts'
import { DEFAULT_PLAYER_SETTINGS, specFor } from '../settings/playerSettingsSpec.ts'
import {
  createMenuState,
  type MenuCommand,
  type MenuState,
  ROOT_ITEMS,
  SETTINGS_ITEM_COUNT,
  stepMenu,
} from './mainMenuModel.ts'

/** Roda uma sequência de comandos e devolve o estado final. */
function run(commands: readonly MenuCommand[], from: MenuState = createMenuState()): MenuState {
  return commands.reduce((state, command) => stepMenu(state, command).state, from)
}

describe('a tela raiz', () => {
  it('começa em ENTRAR', () => {
    expect(createMenuState().rootIndex).toBe(0)
  })

  it('as setas andam pelos três itens', () => {
    expect(run(['down', 'down']).rootIndex).toBe(2)
    expect(run(['down', 'down', 'up']).rootIndex).toBe(1)
  })

  /** Dar a volta num menu de quatro itens faz passar do fim sem perceber. */
  it('para no topo e no fim em vez de dar a volta', () => {
    expect(run(['up', 'up', 'up']).rootIndex).toBe(0)
    expect(run(Array(10).fill('down')).rootIndex).toBe(ROOT_ITEMS.length - 1)
  })

  it('ENTRAR pede o salto para a arena', () => {
    expect(stepMenu(createMenuState(), 'activate').action).toBe('deploy')
  })

  it('TREINO pede o campo de treino', () => {
    expect(stepMenu(run(['down', 'down']), 'activate').action).toBe('train')
  })

  it('CONFIGURAÇÕES abre tela, sem pedir nada ao jogo', () => {
    const config = stepMenu(run(['down']), 'activate')
    expect(config.state.screen).toBe('settings')
    expect(config.action).toBe('none')
  })

  /** Esc na raiz não tem para onde voltar, e não pode entrar no jogo por engano. */
  it('voltar na raiz não faz nada', () => {
    const step = stepMenu(createMenuState(), 'back')
    expect(step.state).toEqual(createMenuState())
    expect(step.action).toBe('none')
  })

  it('as setas laterais não fazem nada na raiz', () => {
    expect(run(['left', 'right'])).toEqual(createMenuState())
  })
})

const inSettings = run(['down', 'activate'])

describe('a tela de configurações', () => {
  it('abre no primeiro ajuste', () => {
    expect(inSettings.settingsIndex).toBe(0)
  })

  it('percorre os ajustes mais restaurar e voltar', () => {
    expect(run(Array(20).fill('down'), inSettings).settingsIndex).toBe(SETTINGS_ITEM_COUNT - 1)
  })

  it('a seta ajusta o valor da linha selecionada', () => {
    const spec = specFor('mouseSensitivity')
    expect(run(['right'], inSettings).settings.mouseSensitivity).toBeCloseTo(
      spec.fallback + spec.step,
      9,
    )
    expect(run(['left'], inSettings).settings.mouseSensitivity).toBeCloseTo(
      spec.fallback - spec.step,
      9,
    )
  })

  it('ajusta o campo de visão quando ele é a linha selecionada', () => {
    const noFov = run(Array(PLAYER_SETTING_KEYS.indexOf('fieldOfViewDeg')).fill('down'), inSettings)
    expect(run(['right'], noFov).settings.fieldOfViewDeg).toBe(
      DEFAULT_PLAYER_SETTINGS.fieldOfViewDeg + specFor('fieldOfViewDeg').step,
    )
  })

  /**
   * A armadilha do menu mal feito: seta lateral sobre `VOLTAR` mexendo no último
   * ajuste tocado. Sobre linha que não é ajuste, a seta não faz nada.
   */
  it('a seta lateral não mexe em nada sobre RESTAURAR ou VOLTAR', () => {
    const emRestaurar = run(Array(PLAYER_SETTING_KEYS.length).fill('down'), inSettings)
    expect(run(['right', 'right'], emRestaurar).settings).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('RESTAURAR devolve tudo ao padrão', () => {
    const mexido = run(['right', 'right', 'right'], inSettings)
    expect(mexido.settings).not.toEqual(DEFAULT_PLAYER_SETTINGS)
    const emRestaurar = run(Array(PLAYER_SETTING_KEYS.length).fill('down'), mexido)
    expect(run(['activate'], emRestaurar).settings).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('VOLTAR e Esc chegam ao mesmo lugar', () => {
    const emVoltar = run(Array(SETTINGS_ITEM_COUNT).fill('down'), inSettings)
    expect(run(['activate'], emVoltar).screen).toBe('root')
    expect(run(['back'], inSettings).screen).toBe('root')
  })

  it('confirmar sobre uma linha de ajuste não muda nada', () => {
    expect(run(['activate'], inSettings)).toEqual(inSettings)
  })

  /** O ajuste feito não pode se perder ao voltar para a raiz. */
  it('o que foi ajustado sobrevive a sair e entrar de novo', () => {
    const mexido = run(['right', 'back'], inSettings)
    expect(run(['activate'], mexido).settings.mouseSensitivity).toBeCloseTo(
      specFor('mouseSensitivity').fallback + specFor('mouseSensitivity').step,
      9,
    )
  })

  it('voltar deixa o cursor em CONFIGURAÇÕES, não no topo', () => {
    expect(run(['back'], inSettings).rootIndex).toBe(1)
  })
})

describe('createMenuState', () => {
  it('parte das configurações que recebeu', () => {
    const settings = { ...DEFAULT_PLAYER_SETTINGS, fieldOfViewDeg: 110 }
    expect(createMenuState(settings).settings).toEqual(settings)
  })
})
