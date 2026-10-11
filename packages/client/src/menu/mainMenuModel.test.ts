import { describe, expect, it } from 'vitest'
import { parseClassLoadout } from '../loadout/classLoadout.ts'
import { PLAYER_SETTING_KEYS } from '../settings/parsePlayerSettings.ts'
import { DEFAULT_PLAYER_SETTINGS, specFor } from '../settings/playerSettingsSpec.ts'
import {
  createMenuState,
  type MenuCommand,
  type MenuState,
  ROOT_ITEMS,
  SETTINGS_ITEM_COUNT,
  selectRow,
  stepMenu,
} from './mainMenuModel.ts'
import { QUICK_MATCH } from './matchSetup.ts'

/** Roda uma sequência de comandos e devolve o estado final. */
function run(commands: readonly MenuCommand[], from: MenuState = createMenuState()): MenuState {
  return commands.reduce((state, command) => stepMenu(state, command).state, from)
}

describe('a tela raiz', () => {
  it('começa em ENTRAR', () => {
    expect(createMenuState().rootIndex).toBe(0)
  })

  it('as setas andam pelos itens', () => {
    expect(run(['down', 'down']).rootIndex).toBe(2)
    expect(run(['down', 'down', 'up']).rootIndex).toBe(1)
  })

  it('a ordem do pedido: as duas partidas, a classe, e o resto como estava', () => {
    expect(ROOT_ITEMS).toEqual([
      'ENTRAR [PARTIDA RÁPIDA]',
      'NOVA PARTIDA',
      'EDITAR CLASSE',
      'CONFIGURAÇÕES',
      'TREINO',
      'VR EXPERIMENTAL',
    ])
  })

  /** Dar a volta num menu de quatro itens faz passar do fim sem perceber. */
  it('para no topo e no fim em vez de dar a volta', () => {
    expect(run(['up', 'up', 'up']).rootIndex).toBe(0)
    expect(run(Array(10).fill('down')).rootIndex).toBe(ROOT_ITEMS.length - 1)
  })

  it('ENTRAR [PARTIDA RÁPIDA] pede o salto para a arena', () => {
    expect(stepMenu(createMenuState(), 'activate').action).toBe('deploy')
  })

  it('TREINO pede o campo de treino', () => {
    expect(stepMenu(run(['down', 'down', 'down', 'down']), 'activate').action).toBe('train')
  })

  it('confirmar com o cursor fora da lista não pede nada', () => {
    const lost = { ...createMenuState(), rootIndex: ROOT_ITEMS.length }
    expect(stepMenu(lost, 'activate')).toEqual({ state: lost, action: 'none' })
  })

  it('VR EXPERIMENTAL, por último, pede a entrada pelo óculos', () => {
    expect(stepMenu(run(Array(5).fill('down')), 'activate').action).toBe('deploy-headset')
  })

  it('CONFIGURAÇÕES abre tela, sem pedir nada ao jogo', () => {
    const config = stepMenu(run(['down', 'down', 'down']), 'activate')
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

const inSettings = run(['down', 'down', 'down', 'activate'])

describe('a tela de configurações', () => {
  it('abre no primeiro ajuste', () => {
    expect(inSettings.settingsIndex).toBe(0)
  })

  it('percorre os ajustes mais restaurar e voltar', () => {
    expect(run(Array(20).fill('down'), inSettings).settingsIndex).toBe(SETTINGS_ITEM_COUNT - 1)
  })

  it('a seta ajusta o valor da linha selecionada', () => {
    const spec = specFor('mouseSensitivity')
    const onMouse = run(
      Array(PLAYER_SETTING_KEYS.indexOf('mouseSensitivity')).fill('down'),
      inSettings,
    )
    expect(run(['right'], onMouse).settings.mouseSensitivity).toBeCloseTo(
      spec.fallback + spec.step,
      9,
    )
    expect(run(['left'], onMouse).settings.mouseSensitivity).toBeCloseTo(
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
  it('a seta lateral não mexe em nada sobre o mapa, RESTAURAR ou VOLTAR', () => {
    for (const extra of [0, 1, 2]) {
      const fora = run(Array(PLAYER_SETTING_KEYS.length + extra).fill('down'), inSettings)
      expect(run(['right', 'right'], fora).settings).toEqual(DEFAULT_PLAYER_SETTINGS)
    }
  })

  it('RESTAURAR devolve tudo ao padrão', () => {
    const mexido = run(['right', 'right', 'right'], inSettings)
    expect(mexido.settings).not.toEqual(DEFAULT_PLAYER_SETTINGS)
    const emRestaurar = run(Array(PLAYER_SETTING_KEYS.length + 1).fill('down'), mexido)
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
    const spec = specFor('mouseSensitivity')
    expect(run(['activate'], mexido).settings.mouseSensitivity).toBeCloseTo(
      spec.fallback + spec.step,
      9,
    )
  })

  /** A dificuldade mudou de casa: é regra da partida, e mora na NOVA PARTIDA. */
  it('não tem mais a dificuldade dos bots', () => {
    expect(PLAYER_SETTING_KEYS).not.toContain('botDifficulty')
  })

  it('voltar deixa o cursor em CONFIGURAÇÕES, não no topo', () => {
    expect(run(['back'], inSettings).rootIndex).toBe(3)
  })
})

const noMapa = run(Array(PLAYER_SETTING_KEYS.length).fill('down').concat('activate'), inSettings)

describe('o mapa do controle', () => {
  it('abre pela linha logo depois dos ajustes', () => {
    expect(noMapa.screen).toBe('gamepad')
  })

  it.each(['back', 'activate'] as const)('%s volta às configurações, no mesmo item', (command) => {
    const volta = run([command], noMapa)
    expect(volta.screen).toBe('settings')
    expect(volta.settingsIndex).toBe(PLAYER_SETTING_KEYS.length)
  })

  it('as setas não fazem nada', () => {
    expect(run(['up', 'down', 'left', 'right'], noMapa)).toEqual(noMapa)
  })

  it('o clique na linha única não mexe em nada', () => {
    expect(selectRow(noMapa, 0)).toEqual(noMapa)
    expect(selectRow(noMapa, 1)).toEqual(noMapa)
  })
})

describe('createMenuState', () => {
  it('parte das preferências que recebeu', () => {
    const settings = { ...DEFAULT_PLAYER_SETTINGS, fieldOfViewDeg: 110 }
    const match = { ...QUICK_MATCH, bots: 1 }
    const loadout = { ...parseClassLoadout(null), melee: 1 }
    const state = createMenuState({ settings, match, loadout })
    expect([state.settings, state.match, state.loadout]).toEqual([settings, match, loadout])
  })
})

const inMatch = run(['down', 'activate'])

describe('a NOVA PARTIDA', () => {
  it('abre na primeira linha, o mapa', () => {
    expect([inMatch.screen, inMatch.matchIndex]).toEqual(['match', 0])
  })

  it('a seta troca os bots e a dificuldade, e para nas pontas', () => {
    const onBots = run(['down', 'down'], inMatch)
    expect(run(['left'], onBots).match.bots).toBe(2)
    expect(run(['right', 'right'], onBots).match.bots).toBe(3)
    const onDifficulty = run(['down'], onBots)
    expect(run(['right'], onDifficulty).match.difficulty).toBe(2)
  })

  it('PRIVADA alterna sim e não', () => {
    expect(run(['down', 'right'], inMatch).match.private).toBe(1)
  })

  it('COMEÇAR entra na partida com a escolha', () => {
    const onStart = run(['down', 'down', 'left', 'down', 'down'], inMatch)
    const step = stepMenu(onStart, 'activate')
    expect(step.action).toBe('deploy-match')
    expect(step.state.match.bots).toBe(2)
  })

  it('VOLTAR e Esc voltam à raiz guardando a escolha, com o cursor na NOVA PARTIDA', () => {
    const mexido = run(['down', 'down', 'left'], inMatch)
    const back = run(['back'], mexido)
    expect([back.screen, back.rootIndex, back.match.bots]).toEqual(['root', 1, 2])
    const onVoltar = run(Array(10).fill('down'), mexido)
    expect(run(['activate'], onVoltar).screen).toBe('root')
  })

  it('confirmar sobre uma escolha não faz nada', () => {
    expect(stepMenu(inMatch, 'activate')).toEqual({ state: inMatch, action: 'none' })
  })

  it('o clique põe o cursor na linha', () => {
    expect(selectRow(inMatch, 4).matchIndex).toBe(4)
  })
})

const inLoadout = run(['down', 'down', 'activate'])

describe('a EDITAR CLASSE', () => {
  it('abre na arma principal, que só tem a sniper', () => {
    expect([inLoadout.screen, inLoadout.loadoutIndex]).toEqual(['loadout', 0])
    expect(run(['right'], inLoadout).loadout.primary).toBe(0)
  })

  it('troca o corpo a corpo e o acabamento de cada arma', () => {
    const loadout = run(
      ['down', 'right', 'down', 'right', 'down', 'right', 'right'],
      inLoadout,
    ).loadout
    expect([loadout.melee, loadout.sniperFinish, loadout.katanaFinish]).toEqual([1, 1, 2])
  })

  it('VOLTAR e Esc voltam à raiz com o cursor na EDITAR CLASSE', () => {
    expect(run(['back'], inLoadout).rootIndex).toBe(2)
    const onVoltar = run(Array(10).fill('down'), inLoadout)
    expect(run(['activate'], onVoltar).screen).toBe('root')
  })

  it('o clique põe o cursor na linha', () => {
    expect(selectRow(inLoadout, 3).loadoutIndex).toBe(3)
  })
})

/**
 * O clique do mouse põe o cursor direto na linha. Antes disto o adapter emitia
 * seta N vezes para chegar até ela, e cada seta é um passo de estado e uma
 * gravação — um clique virava uma rajada delas.
 */
describe('selectRow', () => {
  it('põe o cursor na linha da tela raiz', () => {
    expect(selectRow(createMenuState(), 2).rootIndex).toBe(2)
  })

  it('põe o cursor na linha da tela de configurações', () => {
    expect(selectRow(inSettings, 3).settingsIndex).toBe(3)
  })

  it('não mexe no índice da outra tela', () => {
    expect(selectRow(inSettings, 3).rootIndex).toBe(inSettings.rootIndex)
  })

  /** Índice inválido é `index.html` fora de sincronia com o modelo: não esconder. */
  it.each([-1, 99, 1.5, Number.NaN])('índice inválido (%s) não move nada', (index) => {
    expect(selectRow(createMenuState(), index)).toEqual(createMenuState())
  })
})
