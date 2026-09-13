import { adjustPlayerSetting, PLAYER_SETTING_KEYS } from '../settings/parsePlayerSettings.ts'
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '../settings/playerSettingsSpec.ts'

/**
 * O menu da tela inicial como estado puro: telas, seleção e ajuste, sem dom e
 * sem babylon.
 *
 * Devolve `{ state, action }` em vez de agir: quem aplica o estado é o adapter
 * de dom, e quem reage à ação é o `main.ts`. É o que permite testar a navegação
 * inteira em node, incluindo as bordas que só olho pegaria.
 */
export type MenuScreen = 'root' | 'settings'
export type MenuCommand = 'up' | 'down' | 'left' | 'right' | 'activate' | 'back'

/** O que o menu pede ao jogo. `none` é a esmagadora maioria dos comandos. */
export type MenuAction = 'none' | 'deploy' | 'train'

/** Os itens da tela raiz, na ordem em que aparecem. */
export const ROOT_ITEMS = ['ENTRAR', 'CONFIGURAÇÕES', 'TREINO'] as const

/** Os itens da tela de configurações: os ajustes, mais restaurar e voltar. */
export const SETTINGS_EXTRA_ITEMS = ['RESTAURAR PADRÕES', 'VOLTAR'] as const

export const SETTINGS_ITEM_COUNT = PLAYER_SETTING_KEYS.length + SETTINGS_EXTRA_ITEMS.length

export interface MenuState {
  readonly screen: MenuScreen
  readonly rootIndex: number
  readonly settingsIndex: number
  readonly settings: PlayerSettings
}

export interface MenuStep {
  readonly state: MenuState
  readonly action: MenuAction
}

export function createMenuState(settings: PlayerSettings = DEFAULT_PLAYER_SETTINGS): MenuState {
  return { screen: 'root', rootIndex: 0, settingsIndex: 0, settings }
}

/**
 * ```ts
 * stepMenu(createMenuState(settings), 'down').state.rootIndex // 1
 * ```
 */
export function stepMenu(state: MenuState, command: MenuCommand): MenuStep {
  if (state.screen === 'root') return stepRoot(state, command)
  return stepSettings(state, command)
}

function stepRoot(state: MenuState, command: MenuCommand): MenuStep {
  if (command === 'up' || command === 'down') {
    return still({ ...state, rootIndex: moveIndex(state.rootIndex, command, ROOT_ITEMS.length) })
  }
  if (command !== 'activate') return still(state)
  return activateRoot(state)
}

function activateRoot(state: MenuState): MenuStep {
  if (state.rootIndex === 0) return { state, action: 'deploy' }
  if (state.rootIndex === 1) return still({ ...state, screen: 'settings', settingsIndex: 0 })
  return { state, action: 'train' }
}

function stepSettings(state: MenuState, command: MenuCommand): MenuStep {
  if (command === 'back') return still(toRoot(state))
  if (command === 'up' || command === 'down') {
    return still({
      ...state,
      settingsIndex: moveIndex(state.settingsIndex, command, SETTINGS_ITEM_COUNT),
    })
  }
  if (command === 'left' || command === 'right') return still(adjustAt(state, command))
  return still(activateSettings(state))
}

function activateSettings(state: MenuState): MenuState {
  const extra = state.settingsIndex - PLAYER_SETTING_KEYS.length
  if (extra === 0) return { ...state, settings: DEFAULT_PLAYER_SETTINGS }
  if (extra === 1) return toRoot(state)
  // numa linha de ajuste, confirmar não faz nada: quem ajusta é a seta.
  return state
}

/**
 * As setas laterais só valem sobre uma linha de ajuste. Em `RESTAURAR` e
 * `VOLTAR` elas não fazem nada — em vez de mexer no último ajuste tocado, que é
 * o que um menu mal feito faz.
 */
function adjustAt(state: MenuState, command: 'left' | 'right'): MenuState {
  const key = PLAYER_SETTING_KEYS[state.settingsIndex]
  if (!key) return state
  return {
    ...state,
    settings: adjustPlayerSetting(state.settings, key, command === 'left' ? -1 : 1),
  }
}

/** Voltar à raiz deixa o cursor no item que abriu a sub-tela, não no topo. */
function toRoot(state: MenuState): MenuState {
  return { ...state, screen: 'root' }
}

/**
 * A seleção **para** nas pontas em vez de dar a volta. Dar a volta num menu de
 * quatro itens faz o jogador passar do fim sem perceber que passou.
 */
function moveIndex(index: number, command: 'up' | 'down', count: number): number {
  const next = command === 'up' ? index - 1 : index + 1
  return Math.min(count - 1, Math.max(0, next))
}

function still(state: MenuState): MenuStep {
  return { state, action: 'none' }
}

/**
 * Põe o cursor numa linha, para o clique do mouse não precisar emitir seta N
 * vezes para chegar até ela — cada seta emitida é um passo de estado e uma
 * gravação, e o clique viraria uma rajada delas.
 *
 * Índice fora da lista não move nada: a tela é escrita à mão, então isso é
 * `index.html` e modelo fora de sincronia, e mover o cursor para um lugar que
 * não existe esconderia o defeito.
 */
export function selectRow(state: MenuState, index: number): MenuState {
  const count = state.screen === 'root' ? ROOT_ITEMS.length : SETTINGS_ITEM_COUNT
  if (!Number.isInteger(index) || index < 0 || index >= count) return state
  if (state.screen === 'root') return { ...state, rootIndex: index }
  return { ...state, settingsIndex: index }
}
