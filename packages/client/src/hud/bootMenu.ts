import { fovCone } from '../menu/fovCone.ts'
import type { MenuCommand, MenuScreen, MenuState } from '../menu/mainMenuModel.ts'
import { acceptsRepeat, menuCommandForKey } from '../menu/menuCommandForKey.ts'
import {
  formatPlayerSetting,
  isPlayerSettingDefault,
  PLAYER_SETTING_KEYS,
} from '../settings/parsePlayerSettings.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * O menu da tela inicial em dom (ADR 0001). Adapter puro: **troca atributo e
 * escreve texto**, e nada mais — a navegação inteira mora em
 * `mainMenuModel.ts`, que roda em node e é testado.
 *
 * Sem relógio e sem `requestAnimationFrame`, como todo o hud: quem anima é o
 * css, por atributo.
 *
 * As linhas são escritas à mão no `index.html` porque são fixas. Montar nó aqui
 * seria trocar um html legível por javascript que faz a mesma coisa pior.
 */
export interface BootMenu {
  setState(state: MenuState): void
  onCommand(listener: (command: MenuCommand) => void): void
  /** Clique numa linha: o índice dela, para o cursor ir direto. */
  onSelect(listener: (screen: MenuScreen, index: number) => void): void
  /**
   * Fora do ar enquanto o jogador tem o controle.
   *
   * **É a guarda que impede o jogo mexer no menu**: `trackHeldKeys` escuta no
   * canvas e chama `preventDefault()` sem `stopPropagation()`, então todo wasd
   * da partida sobe até o documento e chegaria aqui. Sem isto, andar para a
   * frente move a seleção em silêncio, e o Esc seguinte mostra o menu parado
   * num item que ninguém escolheu.
   */
  setVisible(visible: boolean): void
}

/** O texto de ajuda, que muda com a tela: um menu não explica o que não vale ali. */
const ROOT_LEGEND = '↑↓ SELECIONAR    [ENTER] CONFIRMAR'
const SETTINGS_LEGEND = '↑↓ MOVER    ←→ AJUSTAR    [ENTER] CONFIRMAR    [ESC] VOLTAR'

/**
 * ```ts
 * const menu = createBootMenu(document)
 * menu.onCommand((command) => { state = stepMenu(state, command).state; menu.setState(state) })
 * ```
 */
export function createBootMenu(root: ElementQuery): BootMenu {
  const refs = queryMenuRefs(root)
  const listeners: Array<(command: MenuCommand) => void> = []
  const selects: Array<(screen: MenuScreen, index: number) => void> = []
  let visible = true
  const emit = (command: MenuCommand): void => {
    for (const listener of listeners) listener(command)
  }
  const select = (screen: MenuScreen, index: number): void => {
    for (const listener of selects) listener(screen, index)
  }
  listenForCommands(refs.menu, () => visible, emit)
  bindRowClicks(refs, select, emit)
  return {
    setState: (state) => writeState(refs, state),
    onCommand: (listener) => {
      listeners.push(listener)
    },
    onSelect: (listener) => {
      selects.push(listener)
    },
    setVisible: (next) => {
      visible = next
      refs.menu.hidden = !next
    },
  }
}

/** Os nós que o menu escreve. Resolvidos uma vez, na carga. */
interface MenuRefs {
  readonly menu: HTMLElement
  readonly legend: HTMLElement
  readonly rootRows: readonly HTMLElement[]
  readonly settingsRows: readonly HTMLElement[]
}

function queryMenuRefs(root: ElementQuery): MenuRefs {
  return {
    menu: requireElement<HTMLElement>(root, '#boot-menu'),
    legend: requireElement<HTMLElement>(root, '#menu-legend'),
    rootRows: rowsOf(requireElement<HTMLElement>(root, '#menu-root')),
    settingsRows: rowsOf(requireElement<HTMLElement>(root, '#menu-settings')),
  }
}

/**
 * `preventDefault` **só** nas teclas mapeadas, a mesma política do `heldKeys.ts`:
 * espaço e setas rolam a página e `/` abre a busca rápida no firefox, mas F5 e
 * devtools têm que continuar funcionando.
 */
function listenForCommands(
  menu: HTMLElement,
  isVisible: () => boolean,
  emit: (command: MenuCommand) => void,
): void {
  menu.ownerDocument.addEventListener('keydown', (event) => {
    if (!isVisible()) return
    const command = menuCommandForKey(event.code)
    if (!command || (event.repeat && !acceptsRepeat(command))) return
    event.preventDefault()
    emit(command)
  })
}

function writeState(refs: MenuRefs, state: MenuState): void {
  refs.menu.dataset.screen = state.screen
  refs.legend.textContent = state.screen === 'root' ? ROOT_LEGEND : SETTINGS_LEGEND
  markSelected(refs.rootRows, state.screen === 'root' ? state.rootIndex : -1)
  markSelected(refs.settingsRows, state.screen === 'settings' ? state.settingsIndex : -1)
  writeValues(refs.menu, state)
  writeCone(refs.menu, state)
}

/** Uma propriedade e um atributo: o cone inteiro é css a partir daqui. */
function writeCone(menu: HTMLElement, state: MenuState): void {
  const cone = fovCone(state.settings.fieldOfViewDeg)
  menu.style.setProperty('--cone-half', `${cone.halfAngleDeg}deg`)
  menu.dataset.focus = PLAYER_SETTING_KEYS[state.settingsIndex] ?? ''
}

function rowsOf(list: HTMLElement): readonly HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>('.menu-row')]
}

function markSelected(rows: readonly HTMLElement[], selected: number): void {
  for (const [index, row] of rows.entries()) {
    if (index === selected) row.dataset.selected = 'true'
    else row.removeAttribute('data-selected')
  }
}

function writeValues(menu: HTMLElement, state: MenuState): void {
  for (const key of PLAYER_SETTING_KEYS) {
    const field = menu.querySelector<HTMLElement>(`[data-setting="${key}"]`)
    if (!field) continue
    field.textContent = formatPlayerSetting(key, state.settings[key])
    field.dataset.default = String(isPlayerSettingDefault(key, state.settings[key]))
  }
}

/**
 * Clicar numa linha seleciona e confirma no mesmo gesto.
 *
 * O fundo da tela **deixa** de entrar no jogo: com menu, clique solto disparando
 * deploy é errado — quem foi escolher uma opção acabaria na arena.
 */
function bindRowClicks(
  refs: MenuRefs,
  select: (screen: MenuScreen, index: number) => void,
  emit: (command: MenuCommand) => void,
): void {
  bindRows(refs.rootRows, 'root', select, emit)
  bindRows(refs.settingsRows, 'settings', select, emit)
}

function bindRows(
  rows: readonly HTMLElement[],
  screen: MenuScreen,
  select: (screen: MenuScreen, index: number) => void,
  emit: (command: MenuCommand) => void,
): void {
  for (const [index, row] of rows.entries()) {
    row.addEventListener('click', () => {
      select(screen, index)
      emit('activate')
    })
  }
}
