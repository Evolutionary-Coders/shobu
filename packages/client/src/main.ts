import { type GameplayConfig, MEDAL_CATALOG, type MeleeWeapon } from '@shobu/core'
import { type ArenaMap, arenaMapById, bootArenaIdOf, firstSpawnOf } from './arena/arenaCatalog.ts'
import { MATCH_ARENAS } from './arena/arenaChoices.ts'
import { createGameAudio, type GameAudio } from './audio/gameAudio.ts'
import { createNarrator } from './audio/narrator.ts'
import { createWebAudioMixer } from './audio/webAudioMixer.ts'
import {
  HUMAN_SKINS,
  type HumanSkinId,
  humanPortraitUrl,
  playerSkinFor,
} from './character/humanSkins.ts'
import { fetchGameplayConfig } from './config/fetchGameplayConfig.ts'
import { withMatchLengthOverride } from './config/matchLengthOverride.ts'
import { withTickHzOverride } from './config/tickHzOverride.ts'
import { firstConnectedPad } from './controller/connectedGamepad.ts'
import { type ArenaHud, createArenaHud } from './hud/arenaHud.ts'
import { createPerfPanel, type PerfPanel } from './hud/arenaHudPerf.ts'
import { type BootMenu, createBootMenu } from './hud/bootMenu.ts'
import { type BootOverlay, createBootOverlay } from './hud/bootOverlay.ts'
import { buildBootSequence, INTRO_IDLE_BEAT_MS, INTRO_LOGO_REVEAL_MS } from './hud/bootSequence.ts'
import { fetchGlyphSheet, GLYPH_SHEET_URL } from './hud/fetchGlyphSheet.ts'
import { keepFullscreenOnGesture } from './hud/fullscreenOnGesture.ts'
import { buildGlitchBands, buildJackInReadout, GLITCH_BAND_COUNT } from './hud/jackIn.ts'
import { mountJackInLayer } from './hud/jackInLayer.ts'
import { medalIconUrl } from './hud/medalFeed.ts'
import { type CaptionLine, createCaptionLine } from './hud/narratorCaptionLine.ts'
import { createProgressSink } from './hud/progressSink.ts'
import { buildTagline } from './hud/tagline.ts'
import { createTerminalPrinter, type TerminalPrinter } from './hud/terminalPrinter.ts'
import { describeTimeToControl, timeToControlMs } from './instrumentation/timeToPlayerControl.ts'
import { createLoadDeadline } from './loading/loadDeadline.ts'
import { type BootBar, createBootBar } from './loading/loadProgress.ts'
import { classKitOf, createClassLoadoutStore } from './loadout/classLoadout.ts'
import type { Rematch } from './matchEnd/rematch.ts'
import { type RematchWiring, takeRematch } from './matchEnd/rematchWiring.ts'
import {
  type ArenaEntry,
  arenaEntryFor,
  type MenuSource,
  menuSourceOfClick,
} from './menu/arenaEntry.ts'
import { createGamepadMenuReader } from './menu/gamepadMenu.ts'
import {
  createMenuState,
  type MenuAction,
  type MenuCommand,
  type MenuState,
  selectRow,
  stepMenu,
  withProfileName,
} from './menu/mainMenuModel.ts'
import { matchLaunchOf, sceneReloadOf } from './menu/matchLaunch.ts'
import { createMatchSetupStore, matchPlanOf } from './menu/matchSetup.ts'
import type { ArenaRenderer } from './renderer/arenaRenderer.ts'
import { createBabylonArenaRenderer } from './renderer/babylonArenaRenderer.ts'
import type { JsonStore } from './settings/jsonStore.ts'
import { createLivePlayerSettings, type LivePlayerSettings } from './settings/livePlayerSettings.ts'
import {
  createMemorySettingsStorage,
  createPlayerSettingsStore,
  type PlayerSettingsStore,
  type SettingsStorage,
} from './settings/playerSettingsStore.ts'
import { createProfileNameStore } from './settings/profileName.ts'

/** Servido pelo `gameplayConfigPlugin` a partir de `config/gameplay.json`. */
const GAMEPLAY_CONFIG_URL = '/gameplay.json'

const waitMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface Intro {
  skip(): void
  readonly finished: Promise<void>
}

/** A carga dos downloads pesados: a promessa de pronto e a consulta imediata. */
interface GameLoad {
  readonly ready: Promise<void>
  isReady(): boolean
}

/**
 * Liga o progresso dos downloads do renderer à barra do boot, e devolve quando
 * o jogo inteiro chegou — ou quando a espera venceu (`loadDeadline.ts`): aí o
 * jogador entra no greybox e a arte chega depois, se chegar.
 */
function watchGameLoad(renderer: ArenaRenderer, bar: BootBar): GameLoad {
  let ready = false
  let resolve = (): void => {}
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  const open = (): void => {
    if (ready) return
    ready = true
    resolve()
  }
  let ratio = 0
  renderer.onLoadProgress((loaded, complete) => {
    ratio = loaded
    bar.loaded(loaded)
    if (complete) open()
  })
  watchLoadDeadline(
    () => ratio,
    () => ready,
    open,
  )
  return { ready: promise, isReady: () => ready }
}

function watchLoadDeadline(ratio: () => number, isReady: () => boolean, open: () => void): void {
  const deadline = createLoadDeadline(performance.now() / 1000)
  const timer = setInterval(() => {
    if (isReady()) {
      clearInterval(timer)
      return
    }
    if (!deadline.expired(ratio(), performance.now() / 1000)) return
    console.warn(JSON.stringify({ event: 'arena-load-released', ratio: ratio() }))
    clearInterval(timer)
    open()
  }, 500)
}

async function boot(): Promise<void> {
  const overlay = createBootOverlay(document)
  keepFullscreenOnGesture(window)
  try {
    mountJackIn()
    // em paralelo: as duas são pequenas, e em série a segunda pagaria uma ida e
    // volta inteira à toa dentro dos cinco segundos do pilar 2.
    const [config, glyphs] = await Promise.all([
      fetchGameplayConfig(GAMEPLAY_CONFIG_URL).then((config) =>
        withMatchLengthOverride(
          withTickHzOverride(config, window.location.search),
          window.location.search,
        ),
      ),
      fetchGlyphSheet(GLYPH_SHEET_URL),
    ])
    await runGame(overlay, config, glyphs)
  } catch (reason) {
    overlay.announceFailure(reason)
  }
}

/** Do visor montado até o menu aberto, com a config e a folha de glifos em mãos. */
async function runGame(
  overlay: BootOverlay,
  config: GameplayConfig,
  glyphs: Awaited<ReturnType<typeof fetchGlyphSheet>>,
): Promise<void> {
  // o hud é montado **antes** da cena: todo nó de dom que ele cria sai do
  // caminho enquanto o babylon ainda nem existe.
  const hud = createArenaHud({ root: document, config, glyphs })
  const perfPanel = createPerfPanel(document, glyphs)
  const storage = settingsStorage()
  const store = createPlayerSettingsStore(storage)
  const choices = menuChoiceStores(storage)
  const settings = createLivePlayerSettings(config.camera, store.read())
  const audio = mountAudio(store.read())
  const scene = sceneChoicesOf(choices)
  const rematch = takeRematch(scene.arena)
  const panels = { hud, perfPanel, captions: createCaptionLine(document), ...scene }
  const renderer = createArenaRenderer(config, panels, settings, audio, rematch.switchTo)
  watchPlayerControl(renderer, overlay)
  const bar = createBootBar(overlay.setProgress)
  const load = watchGameLoad(renderer, bar)
  renderer.start()
  const intro = startIntro(overlay, bar)
  driveMenu({ overlay, renderer, scene, intro, store, choices, settings, audio, load, rematch })
  // o menu só abre com a intro terminada **e** o jogo inteiro baixado: antes
  // disso, entrar era cair no greybox e ver a cidade pipocar depois.
  await Promise.all([intro.finished, load.ready])
  overlay.setPhase('ready')
}

/** O tempo até o controle, e a arte das kills baixando assim que ele chega. */
function watchPlayerControl(renderer: ArenaRenderer, overlay: BootOverlay): void {
  reportControlTiming(renderer, overlay)
  preloadKillArt(renderer)
}

/**
 * As faixas e o mostrador são montados agora, durante o boot, e não quando o
 * jogador entra: umas dezenas de nós são baratas, mas não no quadro em que ele
 * acabou de ganhar o controle. Montados antes, a transição inteira é troca de
 * atributo.
 *
 * A semente vem do relógio para a interferência não ser a mesma toda vez, e
 * entra por parâmetro porque o teste de `buildGlitchBands` precisa ser repetível.
 */
function mountJackIn(): void {
  mountJackInLayer(document, {
    bands: buildGlitchBands({ count: GLITCH_BAND_COUNT, seed: Date.now() }),
    readout: buildJackInReadout(),
  })
}

/**
 * O armazenamento do navegador, ou memória quando ele não existe.
 *
 * O acesso a `window.localStorage` **lança** em alguns navegadores antes de
 * qualquer `getItem` — aba anônima e cookie de terceiro bloqueado —, então a
 * guarda tem que ser aqui, e não dentro do store.
 */
function settingsStorage(): SettingsStorage {
  try {
    return window.localStorage
  } catch {
    return createMemorySettingsStorage()
  }
}

/**
 * O áudio nasce com os volumes guardados, mas **mudo até o primeiro gesto**: o
 * `AudioContext` é suspenso de origem, e é `audio.unlock()` que o acorda.
 */
function mountAudio(settings: ReturnType<PlayerSettingsStore['read']>): GameAudio {
  const mixer = createWebAudioMixer(window)
  const audio = createGameAudio(mixer, createNarrator(mixer, Math.random))
  audio.apply(settings)
  return audio
}

/**
 * Os dezessete ícones e os quatro retratos, **depois** que o jogador ganhou o
 * controle: ~200 kB que não podem disputar os cinco segundos do pilar 2, e que
 * também não podem esperar a primeira kill — buscá-los no toast, na tela de
 * morte ou no cartão de abate deixaria o primeiro como um retângulo vazio, e
 * decodificá-los ali seria um quadro longo no meio do tiroteio.
 */
function preloadKillArt(renderer: ArenaRenderer): void {
  let loaded = false
  renderer.onPlayerControlChange((inControl) => {
    if (!inControl || loaded) return
    loaded = true
    const urls = [
      ...MEDAL_CATALOG.map((medal) => medalIconUrl(medal.slug)),
      ...HUMAN_SKINS.map((skin) => humanPortraitUrl(skin.id)),
    ]
    for (const url of urls) decodeAhead(url)
  })
}

/** Baixa e decodifica fora do quadro; falhar aqui só adia o trabalho para o uso. */
function decodeAhead(url: string): void {
  const image = new Image()
  image.src = url
  image.decode().catch(() => undefined)
}

function createArenaRenderer(
  config: GameplayConfig,
  panels: {
    readonly hud: ArenaHud
    readonly perfPanel: PerfPanel
    readonly captions: CaptionLine
    readonly playerSkin: HumanSkinId
    readonly meleeWeapon: MeleeWeapon
    readonly arena: ArenaMap
  },
  settings: LivePlayerSettings,
  audio: GameAudio,
  onArenaSwitch: (arenaId: string) => void,
): ArenaRenderer {
  const canvas = document.querySelector<HTMLCanvasElement>('#arena-canvas')
  if (!canvas) throw new Error("querySelector('#arena-canvas') não achou o canvas da arena")
  return createBabylonArenaRenderer({
    canvas,
    config,
    spawnPointM: firstSpawnOf(panels.arena),
    ...panels,
    settings,
    audio,
    onArenaSwitch,
  })
}

/**
 * O que a cena monta uma vez só, no boot, a partir das escolhas guardadas: a
 * skin da classe (os bots se vestem das outras) e o mapa. Entrar com outra
 * escolha recarrega a página (`sceneReloadOf`).
 */
function sceneChoicesOf(choices: MenuChoiceStores): {
  readonly playerSkin: HumanSkinId
  readonly meleeWeapon: MeleeWeapon
  readonly arena: ArenaMap
} {
  const kit = classKitOf(choices.loadout.read())
  return {
    playerSkin: playerSkinFor(kit.characterSkinId),
    meleeWeapon: kit.meleeWeapon,
    arena: bootArena(matchPlanOf(choices.match.read()).arenaId),
  }
}

/** O mapa da url (`?arena=neon-kaido`), ou o último que a NOVA PARTIDA escolheu. */
function bootArena(savedArenaId: string): ArenaMap {
  const asked = bootArenaIdOf(window.location.search, savedArenaId)
  if (asked.unknown) console.warn(JSON.stringify({ event: 'arena-unknown', asked: asked.unknown }))
  return arenaMapById(asked.id)
}

function menuChoiceStores(storage: SettingsStorage): MenuChoiceStores {
  return {
    match: createMatchSetupStore(storage),
    loadout: createClassLoadoutStore(storage),
    profileName: createProfileNameStore(storage),
  }
}

interface MenuChoiceStores {
  readonly match: JsonStore<MenuState['match']>
  readonly loadout: JsonStore<MenuState['loadout']>
  readonly profileName: JsonStore<string>
}

interface MenuWiring {
  readonly overlay: BootOverlay
  readonly renderer: ArenaRenderer
  /** O que a cena montou: entrar com outro mapa ou outra skin recarrega a página. */
  readonly scene: { readonly arena: ArenaMap; readonly playerSkin: HumanSkinId }
  readonly intro: Intro
  readonly store: PlayerSettingsStore
  /** A nova partida e a classe, guardadas como as configurações. */
  readonly choices: MenuChoiceStores
  readonly settings: LivePlayerSettings
  readonly audio: GameAudio
  readonly load: GameLoad
  readonly rematch: RematchWiring
}

/**
 * Liga o menu ao jogo: comando entra, estado sai, e só as ações de entrar atravessam.
 *
 * O menu **guarda o estado** entre uma partida e a seguinte, de propósito: quem
 * sai da arena com Esc volta ao painel de configurações no mesmo ajuste que
 * estava mexendo. É o que transforma "entrar, olhar, voltar, ajustar" num
 * laço de preview de verdade, sem nada mais para construir.
 */
function driveMenu(wiring: MenuWiring): void {
  const menu = createBootMenu(document)
  const session = openMenuSession(wiring)
  offerRematch(wiring, menu, session)
  // a guarda que separa o jogo do menu: `trackHeldKeys` escuta no canvas e não
  // chama `stopPropagation`, então todo wasd da partida sobe até o documento.
  let menuVisible = true
  wiring.renderer.onPlayerControlChange((inControl) => {
    menuVisible = !inControl
    menu.setVisible(menuVisible)
  })
  menu.setState(session.state)
  menu.onSelect((screen, index) => {
    if (screen !== session.state.screen) return
    session.state = selectRow(session.state, index)
    menu.setState(session.state)
  })
  menu.onProfileName((raw) => saveProfileName(wiring, menu, session, raw))
  menu.onCommand((command, source) => runCommand(wiring, menu, session, command, source))
  pollGamepadMenu(
    () => menuVisible,
    (command) => runCommand(wiring, menu, session, command, 'gamepad'),
  )
}

function openMenuSession(wiring: MenuWiring): MenuSession {
  return { state: storedMenuState(wiring), introSkipped: false, rematch: wiring.rematch.pending }
}

/** O nome que o campo entregou: limpo pelo modelo, e gravado só se mudou. */
function saveProfileName(
  wiring: MenuWiring,
  menu: BootMenu,
  session: MenuSession,
  raw: string,
): void {
  const named = withProfileName(session.state, raw)
  if (named !== session.state) wiring.choices.profileName.write(named.profileName)
  session.state = named
  menu.setState(session.state)
}

/** O menu como o jogador o deixou: configurações, nova partida e classe guardadas. */
function storedMenuState(wiring: MenuWiring): MenuState {
  return createMenuState({
    settings: wiring.settings.current(),
    match: wiring.choices.match.read(),
    loadout: wiring.choices.loadout.read(),
    profileName: wiring.choices.profileName.read(),
  })
}

/**
 * A gamepad api não tem evento de botão: o menu pelo controle é lido por
 * quadro. A leitura corre **também** com o menu escondido, e só o que sai dela
 * é descartado — assim o B preso de quem agachava não vira "voltar" no quadro
 * em que o START traz o menu de volta.
 */
function pollGamepadMenu(isVisible: () => boolean, emit: (command: MenuCommand) => void): void {
  const reader = createGamepadMenuReader()
  const tick = (nowMs: number): void => {
    const pad = firstConnectedPad(navigator.getGamepads?.())
    const commands = reader.read(pad, nowMs)
    if (isVisible()) for (const command of commands) emit(command)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

interface MenuSession {
  state: ReturnType<typeof createMenuState>
  introSkipped: boolean
  /** A partida seguinte esperando o gesto, depois do recarregamento; `null` no boot de sempre. */
  rematch: Rematch | null
}

function runCommand(
  wiring: MenuWiring,
  menu: BootMenu,
  session: MenuSession,
  command: MenuCommand,
  source: MenuSource,
): void {
  if (!wiring.overlay.acceptsInput() || holdsForNameField(menu, command)) return
  if (session.rematch) {
    answerRematch(wiring, menu, session, command, source)
    return
  }
  // o comando **é** o gesto que o navegador exige para liberar áudio; não há
  // gesto nenhum antes dele, então a música do menu começa aqui.
  wiring.audio.unlock()
  skipIntroOnce(wiring, session)
  const step = stepMenu(session.state, command)
  saveChoices(wiring, session.state, step.state)
  session.state = step.state
  applySettings(wiring, step.state)
  menu.setState(step.state)
  if (step.action === 'edit-profile-name') menu.editProfileName()
  if (step.action === 'none' || step.action === 'edit-profile-name') return
  // pular a intro vale durante o download, entrar não: a barra segue até o
  // fim, e o próximo gesto — que o pointer lock exige — é o que entra.
  if (!wiring.load.isReady()) return
  enterOrReload(wiring, step.action, step.state, source)
}

/** Entra na cena montada, ou recarrega na escolhida com a entrada esperando o gesto. */
function enterOrReload(
  wiring: MenuWiring,
  action: MenuAction,
  state: MenuState,
  source: MenuSource,
): void {
  const reload = sceneReloadOf(action, state, {
    arenaId: wiring.scene.arena.id,
    playerSkin: wiring.scene.playerSkin,
  })
  if (reload) wiring.rematch.reloadInto(reload)
  else launchMatch(wiring, action, state, source)
}

/** Entra na arena com as regras da ação, e guarda a ação: a partida seguinte sai dela. */
function launchMatch(
  wiring: MenuWiring,
  action: MenuAction,
  state: MenuState,
  source: MenuSource,
): void {
  wiring.rematch.launched.action = action
  const launch = matchLaunchOf(action, state)
  wiring.renderer.setMode(launch.mode, launch.rules, launch.looks)
  enterArena(wiring.renderer, wiring.overlay, wiring.intro, arenaEntryFor(action, source))
}

/**
 * Com a partida seguinte esperando, a intro pula sozinha e o aviso aparece
 * assim que o jogo terminou de baixar; o clique nele é o gesto que entra.
 */
function offerRematch(wiring: MenuWiring, menu: BootMenu, session: MenuSession): void {
  const pending = session.rematch
  if (!pending) return
  wiring.intro.skip()
  const label = MATCH_ARENAS.find((arena) => arena.id === pending.arenaId)?.label ?? pending.arenaId
  void wiring.load.ready.then(() => {
    wiring.overlay.setPhase('ready')
    if (session.rematch) wiring.rematch.prompt.show(label)
  })
  wiring.rematch.prompt.onActivate((pointerType) => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    answerRematch(wiring, menu, session, 'activate', menuSourceOfClick(pointerType, coarse))
  })
}

/** Com o aviso na tela: confirmar entra na partida seguinte, voltar fica no menu. */
function answerRematch(
  wiring: MenuWiring,
  menu: BootMenu,
  session: MenuSession,
  command: MenuCommand,
  source: MenuSource,
): void {
  const pending = session.rematch
  if (!pending || !wiring.load.isReady()) return
  if (command !== 'activate' && command !== 'back') return
  session.rematch = null
  wiring.rematch.prompt.hide()
  wiring.audio.unlock()
  skipIntroOnce(wiring, session)
  menu.setState(session.state)
  if (command === 'activate') launchMatch(wiring, pending.action, session.state, source)
}

/**
 * Digitando o nome, o controle não navega: o A e o B só fecham o campo, e as
 * setas dele não podem mexer na lista por trás do teclado da tela. Devolve se
 * o comando ficou com o campo.
 */
function holdsForNameField(menu: BootMenu, command: MenuCommand): boolean {
  if (!menu.isEditingProfileName()) return false
  if (command === 'activate' || command === 'back') menu.finishProfileName()
  return true
}

/**
 * O primeiro comando pula a intro **e** vale: o pilar 2 manda que a intro nunca
 * seja pedágio, e descartar o comando faria o jogador apertar duas vezes.
 */
function skipIntroOnce(wiring: MenuWiring, session: MenuSession): void {
  if (session.introSkipped) return
  session.introSkipped = true
  wiring.intro.skip()
  void wiring.load.ready.then(() => wiring.overlay.setPhase('ready'))
}

/** A nova partida e a classe sobrevivem ao refresh, como as configurações. */
function saveChoices(wiring: MenuWiring, before: MenuState, after: MenuState): void {
  if (after.match !== before.match) wiring.choices.match.write(after.match)
  if (after.loadout === before.loadout) return
  wiring.choices.loadout.write(after.loadout)
  wiring.renderer.prepareMelee(classKitOf(after.loadout).meleeWeapon)
}

/** Aplica e guarda num gesto só: ajuste que não sobrevive ao refresh não é ajuste. */
function applySettings(wiring: MenuWiring, state: MenuSession['state']): void {
  if (state.settings === wiring.settings.current()) return
  wiring.settings.apply(state.settings)
  wiring.store.write(state.settings)
  // a guarda de identidade acima já garante que isto só roda em mudança de
  // fato: a seta presa anda de 5 em 5, e escrever ganho é barato, mas tocar
  // uma prévia por passo viraria metralhadora.
  wiring.audio.apply(state.settings)
}

/**
 * Um clique durante a intro **pula a intro e entra**, na mesma ação. O pilar 2
 * mede do clique no link ao controle do personagem, então cinemática que segura
 * o jogador é literalmente o que ele proíbe: a intro é o que acontece enquanto
 * ninguém pediu para entrar, nunca um pedágio.
 */
function enterArena(
  renderer: ArenaRenderer,
  overlay: BootOverlay,
  intro: Intro,
  entry: ArenaEntry,
): void {
  intro.skip()
  overlay.setPhase('ready')
  // o óculos é escolha explícita do menu (VR EXPERIMENTAL), e não adivinhado
  // pelo aparelho: no celular sem óculos, ENTRAR continua sendo o jogo de sempre.
  const entering = ENTER_BY[entry](renderer)
  entering.catch((reason: unknown) => overlay.announceFailure(reason))
}

const ENTER_BY: Readonly<Record<ArenaEntry, (renderer: ArenaRenderer) => Promise<void>>> = {
  headset: (renderer) => renderer.enterHeadset(),
  gamepad: (renderer) => renderer.enterGamepad(),
  touch: (renderer) => renderer.enterTouch(),
  pointer: (renderer) => renderer.enterPointerLock(),
}

function startIntro(overlay: BootOverlay, bar: BootBar): Intro {
  // o lema entra no dom já no começo e fica invisível até o slam: o css revela
  // pela fase, então não há nada a agendar em javascript.
  overlay.setTagline(buildTagline())
  const lines = buildBootSequence()
  const printer = createTerminalPrinter({
    lines,
    sink: createProgressSink({
      target: overlay.logSink,
      totalLines: lines.length,
      report: bar.printed,
    }),
    wait: waitMs,
  })
  let skipped = false
  const skip = (): void => {
    skipped = true
    printer.skip()
  }
  return { skip, finished: runIntro(overlay, printer, () => skipped) }
}

async function runIntro(
  overlay: BootOverlay,
  printer: TerminalPrinter,
  isSkipped: () => boolean,
): Promise<void> {
  if (!isSkipped()) await waitMs(INTRO_IDLE_BEAT_MS)
  if (!isSkipped()) overlay.setPhase('printing')
  await printer.play()
  if (isSkipped()) return
  overlay.setPhase('revealed')
  await waitMs(INTRO_LOGO_REVEAL_MS)
}

/**
 * `performance.now()` conta do início da navegação, então ele já é o número do
 * pilar 2 — do clique no link ao controle do personagem. Só a primeira entrada
 * conta: reentrar depois de um esc mede a troca de foco, não o carregamento.
 */
function reportControlTiming(renderer: ArenaRenderer, overlay: BootOverlay): void {
  let measured = false
  renderer.onPlayerControlChange((inControl) => {
    overlay.setInGame(inControl)
    if (!inControl || measured) return
    measured = true
    overlay.reportTimeToControl(describeTimeToControl(timeToControlMs(0, performance.now())))
  })
}

void boot()
