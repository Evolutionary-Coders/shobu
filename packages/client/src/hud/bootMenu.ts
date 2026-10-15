import { typedProfileName } from '@shobu/core'
import { CLASS_LOADOUT_SPEC } from '../loadout/classLoadout.ts'
import { loadoutPreviewOf } from '../loadout/loadoutPreview.ts'
import { type MenuSource, menuSourceOfClick } from '../menu/arenaEntry.ts'
import { type ChoiceSpec, choiceLabel } from '../menu/choiceTable.ts'
import { fovCone } from '../menu/fovCone.ts'
import {
  type MenuCommand,
  type MenuScreen,
  type MenuState,
  settingKeyAtRow,
} from '../menu/mainMenuModel.ts'
import { MATCH_SETUP_SPEC } from '../menu/matchSetup.ts'
import { acceptsRepeat, menuCommandForKey } from '../menu/menuCommandForKey.ts'
import { revealScrollTop } from '../menu/panelReveal.ts'
import { rowClickCommandOf } from '../menu/rowClick.ts'
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
  /**
   * Foca o campo do nome de perfil: o teclado físico digita, e no celular o
   * foco abre o teclado da tela. É a resposta à ação `edit-profile-name`.
   */
  editProfileName(): void
  /** Verdade com o campo do nome em foco: o controle não navega, só confirma. */
  isEditingProfileName(): boolean
  /** Sai do campo e entrega o que foi digitado, como o ENTER faz. */
  finishProfileName(): void
  /** O texto do campo, a cada vez que o jogador sai dele. Quem limpa é o modelo. */
  onProfileName(listener: (raw: string) => void): void
}

/** O texto de ajuda, que muda com a tela: um menu não explica o que não vale ali. */
const ROOT_LEGEND = '↑↓ SELECIONAR    [ENTER] CONFIRMAR'
const SETTINGS_LEGEND = '↑↓ MOVER    ←→ AJUSTAR    [ENTER] CONFIRMAR    [ESC] VOLTAR'
const GAMEPAD_LEGEND = '[ENTER] [ESC] [B] VOLTAR'
/**
 * Sobre o nome, e digitando nele. O controle não digita: ele abre o campo, e
 * quem escreve é o teclado — o físico ou o da tela, no toque.
 */
const NAME_LEGEND = '[ENTER] EDITAR NOME (TECLADO OU TOQUE)    ↑↓ MOVER    [ESC] VOLTAR'
const NAME_EDITING_LEGEND = '[ENTER] SALVAR    [ESC] DESFAZER'
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
  listenForCommands(refs, () => visible, emit)
  bindRowClicks(refs, select, emit)
  return {
    setState: (state) => writeState(refs, state),
    ...profileNameField(refs),
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
  readonly name: HTMLInputElement
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
    name: requireElement<HTMLInputElement>(root, '#menu-profile-name'),
  }
}

type ProfileNameField = Pick<
  BootMenu,
  'editProfileName' | 'isEditingProfileName' | 'finishProfileName' | 'onProfileName'
>

function profileNameField(refs: MenuRefs): ProfileNameField {
  const names = bindProfileName(refs)
  return {
    editProfileName: () => {
      // o toque no próprio campo não chega mais aqui (`rowClickCommandOf`);
      // a guarda fica: selecionar tudo de novo com o campo aberto apagaria o
      // cursor que o dedo acabou de pôr.
      if (isEditing(refs)) return
      // sem rolar: o foco também rola todo ancestral até a janela, e o
      // `#boot-overlay` rolava junto (ver `panelReveal.ts`).
      refs.name.focus({ preventScroll: true })
      refs.name.select()
    },
    isEditingProfileName: () => isEditing(refs),
    finishProfileName: () => refs.name.blur(),
    onProfileName: (listener) => {
      names.push(listener)
    },
  }
}

function isEditing(refs: MenuRefs): boolean {
  return refs.name.ownerDocument.activeElement === refs.name
}

/**
 * O campo do nome: formata enquanto se digita, e entrega ao sair dele — ENTER,
 * toque fora, o B do controle. O ESC desfaz: volta ao nome de antes e sai.
 */
function bindProfileName(refs: MenuRefs): Array<(raw: string) => void> {
  const listeners: Array<(raw: string) => void> = []
  const { name } = refs
  let before = ''
  name.addEventListener('focus', () => {
    before = name.value
    refs.legend.textContent = NAME_EDITING_LEGEND
  })
  name.addEventListener('input', () => {
    // só reescreve quando a formatação mudou algo: reescrever sempre jogaria
    // o cursor para o fim a cada letra digitada no meio do nome.
    const typed = typedProfileName(name.value)
    if (typed !== name.value) name.value = typed
  })
  name.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') name.value = before
    if (event.code === 'Escape' || event.code === 'Enter' || event.code === 'NumpadEnter') {
      // o ENTER que fecha o campo é do campo: subindo ao documento, o menu o
      // lia como "confirmar" sobre a linha do nome e reabria o campo na hora.
      event.preventDefault()
      event.stopPropagation()
      name.blur()
    }
  })
  name.addEventListener('blur', () => {
    for (const listener of listeners) listener(name.value)
  })
  return listeners
}

/**
 * `preventDefault` **só** nas teclas mapeadas, a mesma política do `heldKeys.ts`:
 * espaço e setas rolam a página e `/` abre a busca rápida no firefox, mas F5 e
 * devtools têm que continuar funcionando.
 */
function listenForCommands(
  refs: MenuRefs,
  isVisible: () => boolean,
  emit: (command: MenuCommand) => void,
): void {
  refs.menu.ownerDocument.addEventListener('keydown', (event) => {
    // digitando o nome, as teclas são do campo: o W é letra, não seta, e o
    // espaço é espaço, não ENTER. O ENTER e o ESC dele saem pelo próprio campo.
    if (!isVisible() || isEditing(refs)) return
    const command = menuCommandForKey(event.code)
    if (!command || (event.repeat && !acceptsRepeat(command))) return
    event.preventDefault()
    emit(command)
  })
}

function writeState(refs: MenuRefs, state: MenuState): void {
  refs.menu.dataset.screen = state.screen
  refs.legend.textContent = legendOf(refs, state)
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
  // digitando, o campo é do jogador: reescrevê-lo apagaria o que está no meio.
  if (!isEditing(refs)) refs.name.value = state.profileName
}

function legendOf(refs: MenuRefs, state: MenuState): string {
  if (state.screen !== 'settings' || state.settingsIndex !== 0) {
    return LEGEND_BY_SCREEN[state.screen]
  }
  return isEditing(refs) ? NAME_EDITING_LEGEND : NAME_LEGEND
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
  menu.dataset.focus = settingKeyAtRow(state.settingsIndex) ?? ''
}

function rowsOf(list: HTMLElement): readonly HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>('.menu-row')]
}

function markSelected(rows: readonly HTMLElement[], selected: number): void {
  for (const [index, row] of rows.entries()) {
    if (index === selected) row.dataset.selected = 'true'
    else row.removeAttribute('data-selected')
  }
  // a lista longa rola dentro do próprio painel (`bootMenu.css`), e quem anda
  // pelo controle ou pelo teclado não tem dedo para rolá-la: a linha escolhida
  // é que puxa a rolagem. `scrollIntoView` não: ele rolava a tela de boot
  // inteira, e o jogo aparecia por baixo (12/10, `panelReveal.ts`).
  const row = rows[selected]
  if (row) revealInPanel(row)
}

/** Rola só o painel da linha, e só o bastante para ela caber com uma linha de folga. */
function revealInPanel(row: HTMLElement): void {
  const panel = row.closest<HTMLElement>('.menu-panel')
  if (!panel) return
  const top =
    row.getBoundingClientRect().top -
    panel.getBoundingClientRect().top -
    panel.clientTop +
    panel.scrollTop
  panel.scrollTop = revealScrollTop(panel, { top, height: row.offsetHeight }, row.offsetHeight)
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
      const command = rowClickCommandOf(rowClickOf(event.target))
      if (command) emit(command, sourceOf(event))
    })
  }
}

function sourceOf(event: MouseEvent): MenuSource {
  const pointerType = event instanceof PointerEvent ? event.pointerType : undefined
  const view = event.view ?? window
  return menuSourceOfClick(pointerType, view.matchMedia('(pointer: coarse)').matches)
}

/**
 * As setas ‹ › de uma linha de ajuste existem para a tela de toque, onde não há
 * ← → do teclado; e o campo do nome é dele mesmo (`rowClickCommandOf`).
 */
function rowClickOf(target: EventTarget | null): Parameters<typeof rowClickCommandOf>[0] {
  if (!(target instanceof Element)) return { inTextField: false, step: undefined }
  return {
    inTextField: target.closest('input') !== null,
    step: target.closest<HTMLElement>('[data-step]')?.dataset.step,
  }
}
