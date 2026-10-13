import {
  type GameplayConfig,
  GREYBOX_BLOCKOUT,
  GREYBOX_SPAWN_POINTS_M,
  MEDAL_CATALOG,
} from '@shobu/core'
import { createGameAudio, type GameAudio } from './audio/gameAudio.ts'
import { createNarrator } from './audio/narrator.ts'
import type { VoiceStage } from './audio/spatialVoice.ts'
import { createWebAudioMixer } from './audio/webAudioMixer.ts'
import { fetchGameplayConfig } from './config/fetchGameplayConfig.ts'
import { bindPushToTalk } from './controller/pushToTalk.ts'
import { type ArenaHud, createArenaHud } from './hud/arenaHud.ts'
import { type BootMenu, createBootMenu } from './hud/bootMenu.ts'
import { type BootOverlay, createBootOverlay } from './hud/bootOverlay.ts'
import { buildBootSequence, INTRO_IDLE_BEAT_MS, INTRO_LOGO_REVEAL_MS } from './hud/bootSequence.ts'
import { buildGlitchBands, buildJackInReadout, GLITCH_BAND_COUNT } from './hud/jackIn.ts'
import { mountJackInLayer } from './hud/jackInLayer.ts'
import { medalIconUrl } from './hud/medalFeed.ts'
import { createProgressSink } from './hud/progressSink.ts'
import { buildTagline } from './hud/tagline.ts'
import { createTerminalPrinter, type TerminalPrinter } from './hud/terminalPrinter.ts'
import { describeTimeToControl, timeToControlMs } from './instrumentation/timeToPlayerControl.ts'
import { createMenuState, type MenuCommand, selectRow, stepMenu } from './menu/mainMenuModel.ts'
import { type GameLink, openGameLink } from './net/gameLink.ts'
import { createNetworkPort, type NetworkPort } from './net/networkPort.ts'
import { interpolationDelayMs } from './net/remotePlayerView.ts'
import { gameServerUrl, resolveRoomAddress } from './net/roomLocation.ts'
import { openVoiceLink, type VoiceLink } from './net/voiceLink.ts'
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

/** A porta do servidor de jogo, a da Tabela 1 de `docs/rede/arquitetura-de-rede.md`. */
const GAME_SERVER_PORT = 2567

/** A sinalização do servidor de mídia, a da Tabela 1. */
const MEDIA_SERVER_PORT = 7880

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
    const audio = mountAudio(store.read())
    const network = createNetworkPort()
    const voice = createVoiceSeat(config)
    const renderer = createArenaRenderer(config, hud, settings, audio, { network, voice })
    connectToRoom(config, network, voice)
    reportControlTiming(renderer, overlay)
    preloadMedalIcons(renderer)
    renderer.start()
    const intro = startIntro(overlay)
    driveMenu({ overlay, renderer, intro, store, settings, audio })
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
 * Os dezessete ícones, **depois** que o jogador ganhou o controle: 159 kB que
 * não podem disputar os cinco segundos do pilar 2, e que também não podem
 * esperar a primeira medalha — buscá-los no toast deixaria o primeiro deles
 * como um retângulo vazio.
 */
function preloadMedalIcons(renderer: ArenaRenderer): void {
  let loaded = false
  renderer.onPlayerControlChange((inControl) => {
    if (!inControl || loaded) return
    loaded = true
    for (const medal of MEDAL_CATALOG) new Image().src = medalIconUrl(medal.slug)
  })
}

function createArenaRenderer(
  config: GameplayConfig,
  hud: ArenaHud,
  settings: LivePlayerSettings,
  audio: GameAudio,
  links: { readonly network: NetworkPort; readonly voice: VoiceStage },
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
    audio,
    ...links,
  })
}

/**
 * Entra na sala do endereço da url, sem segurar o boot: a arena roda sozinha
 * até a conexão chegar, e falha de conexão vira log e jogo sem sala, não tela
 * de erro. A url mostra o endereço da sala em que se joga, que é o link para
 * chamar alguém: com a sala pedida cheia, é o da sala provisória, e muda de
 * novo quando o servidor chama da fila (CONTEXT.md, "Sala provisória").
 */
function connectToRoom(config: GameplayConfig, network: NetworkPort, voice: VoiceSeat): void {
  const room = resolveRoomAddress(window.location.pathname, randomUint32)
  window.history.replaceState(null, '', room.path)
  const url = gameServerUrl(window.location, GAME_SERVER_PORT)
  const current: { link: GameLink | undefined } = { link: undefined }
  window.addEventListener('pagehide', () => void current.link?.leave())
  const follow = (link: GameLink): void => {
    current.link = link
    network.attach(link)
    voice.follow(link)
    window.history.replaceState(null, '', `/${link.address}`)
    link.onMove((next) => void next().then(follow).catch(logJoinFailure(room.address, url)))
    logJoined(link, room.address)
  }
  openGameLink(url, room.address, interpolationDelayMs(config))
    .then(follow)
    .catch(logJoinFailure(room.address, url))
}

/** O canal de voz da sala em que se joga, trocado junto com ela. */
interface VoiceSeat extends VoiceStage {
  follow(link: GameLink): void
}

/**
 * A voz acompanha a sala de jogo: cada sala tem a sua, e quem troca de sala
 * sai da voz antiga. Sem token, ou com falha, o jogo segue sem voz (ADR 0009).
 */
function createVoiceSeat(config: GameplayConfig): VoiceSeat {
  const url = gameServerUrl(window.location, MEDIA_SERVER_PORT)
  let voice: VoiceLink | undefined
  bindPushToTalk(window, (on) => voice?.talk(on))
  window.addEventListener('pagehide', () => voice?.leave())
  return {
    hearFrom: (eyeM, forward) => voice?.hearFrom(eyeM, forward),
    placeSpeaker: (playerId, mouthM) => voice?.placeSpeaker(playerId, mouthM),
    follow: (link) => {
      voice?.leave()
      voice = undefined
      link.onVoiceTicket((ticket) => {
        openVoiceLink(url, ticket.token, config.voice)
          .then((opened) => {
            voice = opened
          })
          .catch((reason: unknown) => {
            console.warn(
              JSON.stringify({ event: 'voice.join-failed', url, message: String(reason) }),
            )
          })
      })
    },
  }
}

function logJoined(link: GameLink, requested: string): void {
  const { address, sessionId } = link
  console.info(JSON.stringify({ event: 'room.joined', address, requested, sessionId }))
}

function logJoinFailure(address: string, url: string): (reason: unknown) => void {
  return (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    console.error(JSON.stringify({ event: 'room.join-failed', address, url, message }))
  }
}

function randomUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
}

interface MenuWiring {
  readonly overlay: BootOverlay
  readonly renderer: ArenaRenderer
  readonly intro: Intro
  readonly store: PlayerSettingsStore
  readonly settings: LivePlayerSettings
  readonly audio: GameAudio
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
  const session: MenuSession = {
    state: createMenuState(wiring.settings.current()),
    introSkipped: false,
  }
  // a guarda que separa o jogo do menu: `trackHeldKeys` escuta no canvas e não
  // chama `stopPropagation`, então todo wasd da partida sobe até o documento.
  wiring.renderer.onPlayerControlChange((inControl) => menu.setVisible(!inControl))
  menu.setState(session.state)
  menu.onSelect((screen, index) => {
    if (screen !== session.state.screen) return
    session.state = selectRow(session.state, index)
    menu.setState(session.state)
  })
  menu.onCommand((command) => runCommand(wiring, menu, session, command))
}

interface MenuSession {
  state: ReturnType<typeof createMenuState>
  introSkipped: boolean
}

function runCommand(
  wiring: MenuWiring,
  menu: BootMenu,
  session: MenuSession,
  command: MenuCommand,
): void {
  if (!wiring.overlay.acceptsInput()) return
  // o comando **é** o gesto que o navegador exige para liberar áudio; não há
  // gesto nenhum antes dele, então a música do menu começa aqui.
  wiring.audio.unlock()
  skipIntroOnce(wiring, session)
  const step = stepMenu(session.state, command)
  session.state = step.state
  applySettings(wiring, step.state)
  menu.setState(step.state)
  if (step.action === 'none') return
  wiring.renderer.setMode(step.action === 'train' ? 'training' : 'match')
  enterArena(wiring.renderer, wiring.overlay, wiring.intro)
}

/**
 * O primeiro comando pula a intro **e** vale: o pilar 2 manda que a intro nunca
 * seja pedágio, e descartar o comando faria o jogador apertar duas vezes.
 */
function skipIntroOnce(wiring: MenuWiring, session: MenuSession): void {
  if (session.introSkipped) return
  session.introSkipped = true
  wiring.intro.skip()
  wiring.overlay.setPhase('ready')
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
