import { CLASS_LOADOUT_SPEC } from '../loadout/classLoadout.ts'
import { loadoutPreviewOf } from '../loadout/loadoutPreview.ts'
import { type MenuSource, menuSourceOfClick } from '../menu/arenaEntry.ts'
import { type ChoiceSpec, choiceLabel } from '../menu/choiceTable.ts'
import { fovCone } from '../menu/fovCone.ts'
import type { MenuCommand, MenuScreen, MenuState } from '../menu/mainMenuModel.ts'
import { MATCH_SETUP_SPEC } from '../menu/matchSetup.ts'
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
  /** O comando e de onde ele veio: o toque entra num jogo diferente do mouse. */
  onCommand(listener: (command: MenuCommand, source: MenuSource) => void): void
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
const GAMEPAD_LEGEND = '[ENTER] [ESC] [B] VOLTAR'
const CHOICE_LEGEND = '↑↓ MOVER    ←→ ESCOLHER    [ENTER] CONFIRMAR    [ESC] VOLTAR'

const LEGEND_BY_SCREEN: Readonly<Record<MenuScreen, string>> = {
  root: ROOT_LEGEND,
  match: CHOICE_LEGEND,
  loadout: CHOICE_LEGEND,
  settings: SETTINGS_LEGEND,
  gamepad: GAMEPAD_LEGEND,
}

/**
 * ```ts
 * const menu = createBootMenu(document)
 * menu.onCommand((command) => { state = stepMenu(state, command).state; menu.setState(state) })
 * ```
 */
export function createBootMenu(root: ElementQuery): BootMenu {
  const refs = queryMenuRefs(root)
  const listeners: Array<(command: MenuCommand, source: MenuSource) => void> = []
  const selects: Array<(screen: MenuScreen, index: number) => void> = []
  let visible = true
  const emit = (command: MenuCommand, source: MenuSource = 'keyboard'): void => {
    for (const listener of listeners) listener(command, source)
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
  readonly matchRows: readonly HTMLElement[]
  readonly loadoutRows: readonly HTMLElement[]
  readonly settingsRows: readonly HTMLElement[]
  readonly gamepadRows: readonly HTMLElement[]
  readonly thumbnail: HTMLImageElement
  readonly caption: HTMLElement
}

function queryMenuRefs(root: ElementQuery): MenuRefs {
  return {
    menu: requireElement<HTMLElement>(root, '#boot-menu'),
    legend: requireElement<HTMLElement>(root, '#menu-legend'),
    rootRows: rowsOf(requireElement<HTMLElement>(root, '#menu-root')),
    matchRows: rowsOf(requireElement<HTMLElement>(root, '#menu-match')),
    loadoutRows: rowsOf(requireElement<HTMLElement>(root, '#menu-loadout')),
    settingsRows: rowsOf(requireElement<HTMLElement>(root, '#menu-settings')),
    gamepadRows: rowsOf(requireElement<HTMLElement>(root, '#menu-gamepad')),
    thumbnail: requireElement<HTMLImageElement>(root, '#loadout-thumbnail'),
    caption: requireElement<HTMLElement>(root, '#loadout-caption'),
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
  refs.legend.textContent = LEGEND_BY_SCREEN[state.screen]
  markSelected(refs.rootRows, state.screen === 'root' ? state.rootIndex : -1)
  markSelected(refs.matchRows, state.screen === 'match' ? state.matchIndex : -1)
  markSelected(refs.loadoutRows, state.screen === 'loadout' ? state.loadoutIndex : -1)
  markSelected(refs.settingsRows, state.screen === 'settings' ? state.settingsIndex : -1)
  markSelected(refs.gamepadRows, state.screen === 'gamepad' ? 0 : -1)
  writeValues(refs.menu, state)
  writeChoices(refs.menu, 'match', MATCH_SETUP_SPEC, state.match)
  writeChoices(refs.menu, 'loadout', CLASS_LOADOUT_SPEC, state.loadout)
  refs.menu.dataset.privateRoom = String(state.match.private === 1)
  writePreview(refs, state)
  writeCone(refs.menu, state)
}

/** O valor de cada linha de uma tela de escolhas, pelo `data-choice="tela:chave"`. */
function writeChoices<Key extends string>(
  menu: HTMLElement,
  screen: string,
  specs: readonly ChoiceSpec<Key>[],
  values: Readonly<Record<Key, number>>,
): void {
  for (const spec of specs) {
    const field = menu.querySelector<HTMLElement>(`[data-choice="${screen}:${spec.key}"]`)
    if (field) field.textContent = choiceLabel(specs, spec.key, values[spec.key])
  }
}

/**
 * A miniatura da EDITAR CLASSE. Só troca o `src` quando ele muda: reescrever o
 * mesmo endereço a cada seta reiniciaria o carregamento da imagem.
 */
function writePreview(refs: MenuRefs, state: MenuState): void {
  const preview = loadoutPreviewOf(state.loadout, state.loadoutIndex)
  refs.caption.textContent = preview.caption
  refs.thumbnail.hidden = preview.thumbnailUrl === undefined
  const src = preview.thumbnailUrl ?? ''
  if (src && refs.thumbnail.getAttribute('src') !== src) refs.thumbnail.src = src
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
  // no celular deitado a lista de configurações rola (`bootCompact.css`), e
  // quem anda pelo controle ou pelo teclado não tem dedo para rolá-la: a linha
  // escolhida é que puxa a rolagem, para o meio: na ponta, o colchete da seleção
  // ficava cortado pela borda do painel.
  rows[selected]?.scrollIntoView({ block: 'center' })
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
  emit: (command: MenuCommand, source: MenuSource) => void,
): void {
  bindRows(refs.rootRows, 'root', select, emit)
  bindRows(refs.matchRows, 'match', select, emit)
  bindRows(refs.loadoutRows, 'loadout', select, emit)
  bindRows(refs.settingsRows, 'settings', select, emit)
  bindRows(refs.gamepadRows, 'gamepad', select, emit)
}

function bindRows(
  rows: readonly HTMLElement[],
  screen: MenuScreen,
  select: (screen: MenuScreen, index: number) => void,
  emit: (command: MenuCommand, source: MenuSource) => void,
): void {
  for (const [index, row] of rows.entries()) {
    row.addEventListener('click', (event) => {
      select(screen, index)
      emit(stepOf(event.target) ?? 'activate', sourceOf(event))
    })
  }
}

function sourceOf(event: MouseEvent): MenuSource {
  const pointerType = event instanceof PointerEvent ? event.pointerType : undefined
  const view = event.view ?? window
  return menuSourceOfClick(pointerType, view.matchMedia('(pointer: coarse)').matches)
}

/**
 * As setas ‹ › de uma linha de ajuste. Elas existem para a tela de toque, onde
 * não há ← → do teclado; tocar nelas ajusta, e tocar no resto da linha
 * seleciona e confirma, como sempre.
 */
function stepOf(target: EventTarget | null): MenuCommand | undefined {
  if (!(target instanceof Element)) return undefined
  const step = target.closest<HTMLElement>('[data-step]')?.dataset.step
  return step === 'left' || step === 'right' ? step : undefined
}
