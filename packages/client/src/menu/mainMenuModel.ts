import {
  CLASS_LOADOUT_SPEC,
  type ClassLoadout,
  parseClassLoadout,
} from '../loadout/classLoadout.ts'
import { adjustPlayerSetting, PLAYER_SETTING_KEYS } from '../settings/parsePlayerSettings.ts'
import { DEFAULT_PLAYER_SETTINGS, type PlayerSettings } from '../settings/playerSettingsSpec.ts'
import { choiceScreenRows, stepChoiceScreen } from './choiceScreen.ts'
import { MATCH_SETUP_SPEC, type MatchSetup, QUICK_MATCH } from './matchSetup.ts'

/**
 * O menu da tela inicial como estado puro: telas, seleção e ajuste, sem dom e
 * sem babylon.
 *
 * Devolve `{ state, action }` em vez de agir: quem aplica o estado é o adapter
 * de dom, e quem reage à ação é o `main.ts`. É o que permite testar a navegação
 * inteira em node, incluindo as bordas que só olho pegaria.
 */
/**
 * `match` é a NOVA PARTIDA, `loadout` a EDITAR CLASSE; `gamepad` é o mapa dos
 * botões do controle: só leitura, aberto pelas configurações.
 */
export type MenuScreen = 'root' | 'match' | 'loadout' | 'settings' | 'gamepad'
export type MenuCommand = 'up' | 'down' | 'left' | 'right' | 'activate' | 'back'

/**
 * O que o menu pede ao jogo. `none` é a esmagadora maioria dos comandos.
 * `deploy` é a partida rápida; `deploy-match`, o COMEÇAR da nova partida, com
 * a escolha que está no estado; `deploy-headset` é entrar pelo óculos
 * cardboard (ADR 0012).
 */
export type MenuAction = 'none' | 'deploy' | 'deploy-match' | 'train' | 'deploy-headset'

/**
 * Os itens da tela raiz, na ordem em que aparecem. As duas partidas e a classe
 * em cima, que é o que se faz antes de jogar; o VR por último, e com
 * "experimental" no nome: é escolha de quem tem o óculos na mão, nunca o
 * caminho padrão de quem chega no estande.
 */
export const ROOT_ITEMS = [
  'ENTRAR [PARTIDA RÁPIDA]',
  'NOVA PARTIDA',
  'EDITAR CLASSE',
  'CONFIGURAÇÕES',
  'TREINO',
  'VR EXPERIMENTAL',
] as const

/** Os itens da tela de configurações: os ajustes, mais o mapa, restaurar e voltar. */
export const SETTINGS_EXTRA_ITEMS = ['MAPA DO CONTROLE', 'RESTAURAR PADRÕES', 'VOLTAR'] as const

export const SETTINGS_ITEM_COUNT = PLAYER_SETTING_KEYS.length + SETTINGS_EXTRA_ITEMS.length

/** As linhas de ação embaixo das escolhas de cada tela. */
export const MATCH_ACTION_ITEMS = ['COMEÇAR', 'VOLTAR'] as const
export const LOADOUT_ACTION_ITEMS = ['VOLTAR'] as const

/** Quantas linhas cada tela tem, na ordem do `index.html`. */
const ROW_COUNT: Readonly<Record<MenuScreen, number>> = {
  root: ROOT_ITEMS.length,
  match: choiceScreenRows(MATCH_SETUP_SPEC, MATCH_ACTION_ITEMS.length),
  loadout: choiceScreenRows(CLASS_LOADOUT_SPEC, LOADOUT_ACTION_ITEMS.length),
  settings: SETTINGS_ITEM_COUNT,
  gamepad: 1,
}

/** O índice de cada tela que guarda cursor. O mapa do controle não guarda. */
type CursorScreen = Exclude<MenuScreen, 'gamepad'>
const CURSOR_FIELD = {
  root: 'rootIndex',
  match: 'matchIndex',
  loadout: 'loadoutIndex',
  settings: 'settingsIndex',
} as const satisfies Record<CursorScreen, keyof MenuState>

export interface MenuState {
  readonly screen: MenuScreen
  readonly rootIndex: number
  readonly matchIndex: number
  readonly loadoutIndex: number
  readonly settingsIndex: number
  readonly settings: PlayerSettings
  /** A escolha da NOVA PARTIDA. A partida rápida não a usa. */
  readonly match: MatchSetup
  readonly loadout: ClassLoadout
}

export interface MenuStep {
  readonly state: MenuState
  readonly action: MenuAction
}

/** O que o menu recebe guardado no boot. O que faltar é o padrão. */
export interface MenuPreferences {
  readonly settings?: PlayerSettings
  readonly match?: MatchSetup
  readonly loadout?: ClassLoadout
}

export function createMenuState(preferences: MenuPreferences = {}): MenuState {
  return {
    screen: 'root',
    rootIndex: 0,
    matchIndex: 0,
    loadoutIndex: 0,
    settingsIndex: 0,
    settings: preferences.settings ?? DEFAULT_PLAYER_SETTINGS,
    match: preferences.match ?? QUICK_MATCH,
    loadout: preferences.loadout ?? parseClassLoadout(null),
  }
}

const STEP_BY_SCREEN: Readonly<
  Record<MenuScreen, (state: MenuState, command: MenuCommand) => MenuStep>
> = {
  root: (state, command) => stepRoot(state, command),
  match: (state, command) => stepMatch(state, command),
  loadout: (state, command) => stepLoadout(state, command),
  settings: (state, command) => stepSettings(state, command),
  gamepad: (state, command) => still(stepGamepadMap(state, command)),
}

/**
 * ```ts
 * stepMenu(createMenuState(), 'down').state.rootIndex // 1
 * ```
 */
export function stepMenu(state: MenuState, command: MenuCommand): MenuStep {
  return STEP_BY_SCREEN[state.screen](state, command)
}

function stepRoot(state: MenuState, command: MenuCommand): MenuStep {
  if (command === 'up' || command === 'down') {
    return still({ ...state, rootIndex: moveIndex(state.rootIndex, command, ROOT_ITEMS.length) })
  }
  if (command !== 'activate') return still(state)
  return activateRoot(state)
}

/** O que cada item da raiz pede: uma ação ao jogo, ou abrir uma tela. */
const ROOT_ACTIONS: Readonly<Record<(typeof ROOT_ITEMS)[number], MenuAction | MenuScreen>> = {
  'ENTRAR [PARTIDA RÁPIDA]': 'deploy',
  'NOVA PARTIDA': 'match',
  'EDITAR CLASSE': 'loadout',
  CONFIGURAÇÕES: 'settings',
  TREINO: 'train',
  'VR EXPERIMENTAL': 'deploy-headset',
}

const SCREEN_OPENED_BY_ROOT: ReadonlySet<string> = new Set(['match', 'loadout', 'settings'])

function activateRoot(state: MenuState): MenuStep {
  const item = ROOT_ITEMS[state.rootIndex]
  // índice fora da lista é `index.html` fora de sincronia com o modelo: não
  // adivinhar um item, não fazer nada.
  if (item === undefined) return still(state)
  const target = ROOT_ACTIONS[item]
  if (SCREEN_OPENED_BY_ROOT.has(target)) return still(openScreen(state, target as CursorScreen))
  return { state, action: target as MenuAction }
}

/** Abrir uma sub-tela põe o cursor na primeira linha dela. */
function openScreen(state: MenuState, screen: CursorScreen): MenuState {
  return { ...state, screen, [CURSOR_FIELD[screen]]: 0 }
}

/** A NOVA PARTIDA: COMEÇAR entra com a escolha; VOLTAR e Esc voltam à raiz. */
function stepMatch(state: MenuState, command: MenuCommand): MenuStep {
  const step = stepChoiceScreen(
    {
      index: state.matchIndex,
      values: state.match,
      specs: MATCH_SETUP_SPEC,
      actionCount: MATCH_ACTION_ITEMS.length,
    },
    command,
  )
  const next = { ...state, matchIndex: step.index, match: step.values }
  if (step.leave || step.action === 1) return still(toRoot(next))
  return { state: next, action: step.action === 0 ? 'deploy-match' : 'none' }
}

/** A EDITAR CLASSE: a seta troca a escolha, e VOLTAR e Esc voltam à raiz. */
function stepLoadout(state: MenuState, command: MenuCommand): MenuStep {
  const step = stepChoiceScreen(
    {
      index: state.loadoutIndex,
      values: state.loadout,
      specs: CLASS_LOADOUT_SPEC,
      actionCount: LOADOUT_ACTION_ITEMS.length,
    },
    command,
  )
  const next = { ...state, loadoutIndex: step.index, loadout: step.values }
  return still(step.leave || step.action === 0 ? toRoot(next) : next)
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
  if (extra === 0) return { ...state, screen: 'gamepad' }
  if (extra === 1) return { ...state, settings: DEFAULT_PLAYER_SETTINGS }
  if (extra === 2) return toRoot(state)
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

/**
 * O mapa só tem a linha de voltar, então confirmar e voltar fazem o mesmo — e
 * as setas não fazem nada. Volta às configurações com o cursor onde estava,
 * em cima do item que abriu o mapa.
 */
function stepGamepadMap(state: MenuState, command: MenuCommand): MenuState {
  if (command !== 'back' && command !== 'activate') return state
  return { ...state, screen: 'settings' }
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
  if (!Number.isInteger(index) || index < 0 || index >= ROW_COUNT[state.screen]) return state
  // o mapa tem uma linha só, e não guarda cursor: nada a mover.
  if (state.screen === 'gamepad') return state
  return { ...state, [CURSOR_FIELD[state.screen]]: index }
}
