import type { GameplayConfig } from '@shobu/core'
import { GREYBOX_BLOCKOUT, GREYBOX_SPAWN_POINTS_M } from './arena/greyboxBlockout.ts'
import { fetchGameplayConfig } from './config/fetchGameplayConfig.ts'
import { type ArenaHud, createArenaHud } from './hud/arenaHud.ts'
import { createBootMenu } from './hud/bootMenu.ts'
import { type BootOverlay, createBootOverlay } from './hud/bootOverlay.ts'
import { buildBootSequence, INTRO_IDLE_BEAT_MS, INTRO_LOGO_REVEAL_MS } from './hud/bootSequence.ts'
import { buildGlitchBands, buildJackInReadout, GLITCH_BAND_COUNT } from './hud/jackIn.ts'
import { mountJackInLayer } from './hud/jackInLayer.ts'
import { createProgressSink } from './hud/progressSink.ts'
import { buildTagline } from './hud/tagline.ts'
import { createTerminalPrinter, type TerminalPrinter } from './hud/terminalPrinter.ts'
import { describeTimeToControl, timeToControlMs } from './instrumentation/timeToPlayerControl.ts'
import { createMenuState, selectRow, stepMenu } from './menu/mainMenuModel.ts'
import type { ArenaRenderer } from './renderer/arenaRenderer.ts'
import { createBabylonArenaRenderer } from './renderer/babylonArenaRenderer.ts'
import { createLivePlayerSettings, type LivePlayerSettings } from './settings/livePlayerSettings.ts'
import {
  createMemorySettingsStorage,
  createPlayerSettingsStore,
  type PlayerSettingsStore,
  type SettingsStorage,
} from './settings/playerSettingsStore.ts'

/** Servido pelo `gameplayConfigPlugin` a partir de `config/gameplay.json`. */
const GAMEPLAY_CONFIG_URL = '/gameplay.json'

const waitMs = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface Intro {
  skip(): void
  readonly finished: Promise<void>
}

async function boot(): Promise<void> {
  const overlay = createBootOverlay(document)
  try {
    mountJackIn()
    const config = await fetchGameplayConfig(GAMEPLAY_CONFIG_URL)
    // o visor é montado **antes** da cena: todo nó de dom que ele cria sai do
    // caminho enquanto o babylon ainda nem existe.
    const hud = createArenaHud({ root: document, config })
    const store = createPlayerSettingsStore(settingsStorage())
    const settings = createLivePlayerSettings(config.camera, store.read())
    const renderer = createArenaRenderer(config, hud, settings)
    reportControlTiming(renderer, overlay)
    renderer.start()
    const intro = startIntro(overlay)
    driveMenu({ overlay, renderer, intro, store, settings })
    await intro.finished
    overlay.setPhase('ready')
  } catch (reason) {
    overlay.announceFailure(reason)
  }
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

function createArenaRenderer(
  config: GameplayConfig,
  hud: ArenaHud,
  settings: LivePlayerSettings,
): ArenaRenderer {
  const canvas = document.querySelector<HTMLCanvasElement>('#arena-canvas')
  if (!canvas) throw new Error("querySelector('#arena-canvas') não achou o canvas da arena")
  const spawnPointM = GREYBOX_SPAWN_POINTS_M[0]
  if (!spawnPointM) throw new Error('GREYBOX_SPAWN_POINTS_M está vazio; esperado 12 pontos')
  return createBabylonArenaRenderer({
    canvas,
    config,
    blockout: GREYBOX_BLOCKOUT,
    spawnPointM,
    hud,
    settings,
  })
}

interface MenuWiring {
  readonly overlay: BootOverlay
  readonly renderer: ArenaRenderer
  readonly intro: Intro
  readonly store: PlayerSettingsStore
  readonly settings: LivePlayerSettings
}

/**
 * Liga o menu ao jogo: comando entra, estado sai, e só duas ações atravessam.
 *
 * O menu **guarda o estado** entre uma partida e a seguinte, de propósito: quem
 * sai da arena com Esc volta ao painel de configurações no mesmo ajuste que
 * estava mexendo. É o que transforma "entrar, olhar, voltar, ajustar" num
 * laço de preview de verdade, sem nada mais para construir.
 */
function driveMenu(wiring: MenuWiring): void {
  const menu = createBootMenu(document)
  // a guarda que separa o jogo do menu: `trackHeldKeys` escuta no canvas e não
  // chama `stopPropagation`, então todo wasd da partida sobe até o documento.
  wiring.renderer.onPlayerControlChange((inControl) => menu.setVisible(!inControl))
  let state = createMenuState(wiring.settings.current())
  let introSkipped = false
  menu.setState(state)
  menu.onSelect((screen, index) => {
    if (screen !== state.screen) return
    state = selectRow(state, index)
    menu.setState(state)
  })
  menu.onCommand((command) => {
    if (!wiring.overlay.acceptsInput()) return
    // o primeiro comando pula a intro **e** vale: pilar 2 manda que a intro
    // nunca seja pedágio, e descartar o comando faria o jogador apertar duas
    // vezes. `skip()` é idempotente, mas o atalho poupa a escrita por tecla.
    if (!introSkipped) {
      introSkipped = true
      wiring.intro.skip()
      wiring.overlay.setPhase('ready')
    }
    const step = stepMenu(state, command)
    state = step.state
    applySettings(wiring, state)
    menu.setState(state)
    if (step.action !== 'none') enterArena(wiring.renderer, wiring.overlay, wiring.intro)
  })
}

/** Aplica e guarda num gesto só: ajuste que não sobrevive ao refresh não é ajuste. */
function applySettings(wiring: MenuWiring, state: ReturnType<typeof createMenuState>): void {
  if (state.settings === wiring.settings.current()) return
  wiring.settings.apply(state.settings)
  wiring.store.write(state.settings)
}

/**
 * Um clique durante a intro **pula a intro e entra**, na mesma ação. O pilar 2
 * mede do clique no link ao controle do personagem, então cinemática que segura
 * o jogador é literalmente o que ele proíbe: a intro é o que acontece enquanto
 * ninguém pediu para entrar, nunca um pedágio.
 */
function enterArena(renderer: ArenaRenderer, overlay: BootOverlay, intro: Intro): void {
  intro.skip()
  overlay.setPhase('ready')
  renderer.enterPointerLock().catch((reason: unknown) => overlay.announceFailure(reason))
}

function startIntro(overlay: BootOverlay): Intro {
  // o lema entra no dom já no começo e fica invisível até o slam: o css revela
  // pela fase, então não há nada a agendar em javascript.
  overlay.setTagline(buildTagline())
  const lines = buildBootSequence()
  const printer = createTerminalPrinter({
    lines,
    sink: createProgressSink({
      target: overlay.logSink,
      totalLines: lines.length,
      report: overlay.setProgress,
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
