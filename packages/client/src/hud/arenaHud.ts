import type { GameplayConfig, MedalAward, WeaponPhase } from '@shobu/core'
import { ammoPipStates } from './ammoPips.ts'
import { mountArenaHudLayer } from './arenaHudLayer.ts'
import { createKillfeed, type KillEntry, type Killfeed } from './killfeed.ts'
import { clockLabel, clockTone, matchProgressPercent, type SessionMode } from './matchClock.ts'
import { type MedalToast, medalToasts, toastDelayMs } from './medalFeed.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import { boltCycleMs, reloadMs, scopeOpenMs } from './scopeTiming.ts'
import type { ScopeView } from './scopeView.ts'
import { killPointsField, scoreField, weaponField } from './visorFields.ts'

/**
 * O visor de combate, visto de fora: uma interface que o jogo chama por
 * evento, nunca por quadro.
 *
 * **O hud não tem `requestAnimationFrame`, `setInterval` nem `setTimeout`.** O
 * relógio tem guarda de segundo inteiro e escreve 1×/s mesmo chamado a 60 Hz;
 * munição, ferrolho, placar, killfeed e hitmarker são por evento; a luneta é
 * transição de css. Proibidos aqui dentro, e o motivo de cada um:
 *
 * - `backdrop-filter`: lê o framebuffer todo quadro (o jackIn.css só pode
 *   porque é um disparo de 960 ms).
 * - `will-change` permanente: prende camada em vram junto com o framebuffer
 *   do babylon pela partida inteira.
 * - `getBoundingClientRect`, `offsetWidth`, `getComputedStyle`: um destes num
 *   ouvinte força layout síncrono num quadro que é do laço de render.
 */
export interface ArenaHud extends ScopeView {
  /** Mostra ou esconde o visor. Casado com o fim do jack-in. */
  setVisible(visible: boolean): void
  /** Munição carregada e o que a arma está fazendo. Por evento, nunca por quadro. */
  setAmmo(loaded: number, phase: WeaponPhase): void
  setScore(kills: number): void
  /** Segundos restantes. Só escreve no dom quando o segundo inteiro muda. */
  setTimeLeft(secondsLeft: number): void
  /** Partida ou treino. No treino o relógio não conta. */
  setMode(mode: SessionMode): void
  pushKill(entry: KillEntry): void
  /** Reinicia a animação mesmo em acertos seguidos. */
  showHitmarker(): void
  /**
   * Os pontos da kill na diagonal da retícula, com os nomes das medalhas que
   * os renderam logo abaixo — é o registro, no desenho do black ops 2.
   */
  showKillPoints(points: number, medals: readonly string[]): void
  /** As medalhas da kill, uma de cada vez, grandes, no topo central. */
  pushMedals(awards: readonly MedalAward[]): void
  dispose(): void
}

export interface ArenaHudOptions {
  readonly root: ElementQuery
  readonly config: GameplayConfig
}

/**
 * ```ts
 * const hud = createArenaHud({ root: document, config })
 * hud.setVisible(true)
 * ```
 */
// raiz de composição: cada linha é uma ligação só, e quebrar em duas funções
// aqui inventaria um nível de indireção que não existe no problema.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: raiz de composição
export function createArenaHud(options: ArenaHudOptions): ArenaHud {
  const { config } = options
  const hud = requireElement<HTMLElement>(options.root, '#arena-hud')
  const clock = requireElement<HTMLElement>(options.root, '#hud-clock')
  const score = requireElement<HTMLElement>(options.root, '#hud-score')
  const weapon = requireElement<HTMLElement>(options.root, '#hud-weapon')
  const feed = requireElement<HTMLElement>(options.root, '#hud-killfeed')
  const hitmarker = requireElement<HTMLElement>(options.root, '#hitmarker')
  const killPoints = requireElement<HTMLElement>(options.root, '#hud-killpoints')
  const pointsValue = requireElement<HTMLElement>(options.root, '.killpoints-value')
  const pointsMedals = requireElement<HTMLElement>(options.root, '.killpoints-medals')
  const medals = requireElement<HTMLElement>(options.root, '#hud-medals')
  mountArenaHudLayer(options.root, { pipCount: config.weapon.magazineRounds })
  writeDurations(hud, config)
  const killfeed = createKillfeed()
  let lastWholeSecond = Number.NaN
  const state = { hitToggle: 'a', pointsToggle: 'a', mode: 'match' as SessionMode }
  const api: ArenaHud = {
    setVisible: (visible) => {
      hud.dataset.hud = visible ? 'live' : 'off'
    },
    setAmmo: (loaded, phase) => {
      // uma leitura por tiro: `ammoPipStates` valida a faixa e o css desenha.
      hud.dataset.ammo = `${ammoPipStates(loaded, config.weapon.magazineRounds, phase).filter((pip) => pip !== 'spent').length}`
      hud.dataset.weapon = phase
      weapon.textContent = weaponField(loaded, phase)
    },
    setScore: (kills) => {
      score.textContent = scoreField(kills)
    },
    setTimeLeft: (secondsLeft) => {
      const whole = Math.ceil(Math.max(0, secondsLeft))
      if (whole === lastWholeSecond) return
      lastWholeSecond = whole
      writeClock(hud, clock, config, { mode: state.mode, secondsLeft })
    },
    setMode: (mode) => {
      state.mode = mode
      // o segundo guardado é invalidado: sem isto, trocar de modo no mesmo
      // segundo deixaria o relógio no texto do modo anterior.
      lastWholeSecond = Number.NaN
    },
    pushKill: (entry) => writeKillfeed(feed, killfeed, entry),
    pushMedals: (awards) => writeMedalFeed(medals, awards),
    showHitmarker: () => {
      // alternar o nome da animação é o que a reinicia: escrever o mesmo valor
      // numa propriedade não reinicia animação nenhuma (ver jackIn.css).
      state.hitToggle = state.hitToggle === 'a' ? 'b' : 'a'
      hitmarker.dataset.hit = state.hitToggle
    },
    showKillPoints: (points, earned) => {
      pointsValue.textContent = killPointsField(points)
      pointsMedals.replaceChildren(...earned.map((label) => medalTally(pointsMedals, label)))
      state.pointsToggle = state.pointsToggle === 'a' ? 'b' : 'a'
      killPoints.dataset.pop = state.pointsToggle
    },
    open: () => {
      hud.dataset.scope = 'on'
    },
    close: () => {
      hud.removeAttribute('data-scope')
    },
    dispose: () => {
      hud.dataset.hud = 'off'
    },
  }
  api.setAmmo(config.weapon.magazineRounds, 'ready')
  api.setScore(0)
  api.setTimeLeft(config.match.durationS)
  return api
}

interface ClockFrame {
  readonly mode: SessionMode
  readonly secondsLeft: number
}

/**
 * No treino a barra de progresso também para: ela é o mesmo relógio desenhado
 * de outro jeito, e uma barra andando sob a palavra TREINO seria a tela
 * contando o que ela acabou de dizer que não conta.
 */
function writeClock(
  hud: HTMLElement,
  clock: HTMLElement,
  config: GameplayConfig,
  frame: ClockFrame,
): void {
  clock.textContent = clockLabel(frame.mode, frame.secondsLeft)
  if (frame.mode === 'training') {
    hud.dataset.clock = 'calm'
    hud.style.setProperty('--match-progress', '0%')
    return
  }
  hud.dataset.clock = clockTone(frame.secondsLeft)
  hud.style.setProperty(
    '--match-progress',
    `${matchProgressPercent(frame.secondsLeft, config.match.durationS)}%`,
  )
}

/** As durações do css saem do config, para a tela não contar tempo diferente do jogo. */
function writeDurations(hud: HTMLElement, config: GameplayConfig): void {
  hud.style.setProperty('--scope-open', `${scopeOpenMs(config)}ms`)
  hud.style.setProperty('--bolt-cycle', `${boltCycleMs(config)}ms`)
  hud.style.setProperty('--reload-time', `${reloadMs(config)}ms`)
}

/**
 * Nós novos por kill, e não troca de texto em nós fixos: reaproveitar o nó não
 * reinicia a animação de entrada, e a linha antiga nunca sumiria. Quatro nós
 * numa taxa de alguns por minuto é churn de dom no lado certo da conta.
 */
function writeKillfeed(feed: HTMLElement, killfeed: Killfeed, entry: KillEntry): void {
  const document = feed.ownerDocument
  const lines = killfeed.push(entry).map((line) => {
    const node = document.createElement('p')
    node.className = line.tone === 'mine' ? 'kill-line kill-line--mine' : 'kill-line'
    node.textContent = line.text
    return node
  })
  feed.replaceChildren(...lines)
}

/**
 * Nós novos por medalha, pela mesma razão do killfeed: reaproveitar o nó não
 * reinicia a animação de entrada.
 *
 * **Acrescenta, e não reescreve a lista.** Os toasts que já estão no ar
 * continuam a própria animação até sumirem sozinhos; recriá-los aqui faria
 * cada um voltar ao começo a cada medalha nova. A capacidade é o que impede a
 * pilha de crescer sem fim, e quem sai é sempre o mais velho.
 */
function writeMedalFeed(root: HTMLElement, awards: readonly MedalAward[]): void {
  if (awards.length === 0) return
  // a kill nova troca a fila da anterior, e não entra atrás dela: a medalha que
  // o jogador acabou de ganhar é a que importa, e esperar a fila velha a
  // mostraria segundos depois do tiro.
  root.replaceChildren(...medalToasts(awards).map((toast, index) => medalNode(root, toast, index)))
}

function medalNode(root: HTMLElement, toast: MedalToast, index: number): HTMLElement {
  const node = root.ownerDocument.createElement('div')
  node.className = 'medal-toast'
  node.dataset.rarity = toast.rarity
  // a fila é atraso de css: até a vez dele, o toast está no quadro 0%, que é
  // invisível. é o que permite uma medalha de cada vez sem relógio nenhum.
  node.style.animationDelay = `${toastDelayMs(index)}ms`
  node.append(medalIcon(root, toast), medalLabel(root, toast))
  return node
}

function medalIcon(root: HTMLElement, toast: MedalToast): HTMLElement {
  const icon = root.ownerDocument.createElement('img')
  icon.className = 'medal-icon'
  icon.src = toast.iconUrl
  // o nome já está no `.medal-label` ao lado; repetir aqui faria o leitor de
  // tela dizer a medalha duas vezes.
  icon.alt = ''
  return icon
}

function medalLabel(root: HTMLElement, toast: MedalToast): HTMLElement {
  const label = root.ownerDocument.createElement('p')
  label.className = 'medal-label'
  label.textContent = toast.label
  return label
}

/** Uma linha do registro da retícula: o nome do que rendeu os pontos. */
function medalTally(root: HTMLElement, label: string): HTMLElement {
  const line = root.ownerDocument.createElement('span')
  line.className = 'killpoints-medal'
  line.textContent = label
  return line
}

/**
 * Visor que não faz nada. É o que o renderer usa quando não há hud montado —
 * um teste, ou um canvas sem a tela em volta.
 */
export function createSilentHud(): ArenaHud {
  return {
    setVisible: () => {},
    setAmmo: () => {},
    setScore: () => {},
    setTimeLeft: () => {},
    setMode: () => {},
    pushKill: () => {},
    showHitmarker: () => {},
    showKillPoints: () => {},
    pushMedals: () => {},
    open: () => {},
    close: () => {},
    dispose: () => {},
  }
}
