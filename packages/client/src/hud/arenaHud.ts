import type { GameplayConfig, WeaponPhase } from '@shobu/core'
import { ammoPipStates } from './ammoPips.ts'
import { mountArenaHudLayer } from './arenaHudLayer.ts'
import { createKillfeed, type KillEntry, type Killfeed } from './killfeed.ts'
import { clockLabel, clockTone, matchProgressPercent, type SessionMode } from './matchClock.ts'
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
  /** Os pontos da kill, subindo na diagonal da retícula. */
  showKillPoints(points: number): void
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
    showHitmarker: () => {
      // alternar o nome da animação é o que a reinicia: escrever o mesmo valor
      // numa propriedade não reinicia animação nenhuma (ver jackIn.css).
      state.hitToggle = state.hitToggle === 'a' ? 'b' : 'a'
      hitmarker.dataset.hit = state.hitToggle
    },
    showKillPoints: (points) => {
      killPoints.textContent = killPointsField(points)
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
    open: () => {},
    close: () => {},
    dispose: () => {},
  }
}
