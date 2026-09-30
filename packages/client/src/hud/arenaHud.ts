import type { GameplayConfig, MedalAward, WeaponPhase } from '@shobu/core'
import { createCombatLog, type HudScore } from './arenaHudCombatLog.ts'
import { createKillFeeds } from './arenaHudFeeds.ts'
import { createGrapplePanel, createWeaponPanel } from './arenaHudLoadout.ts'
import { createStatusPanel } from './arenaHudStatus.ts'
import { BOUNDARY_WARNING_TITLE, boundaryTenths, boundaryTone } from './boundaryWarning.ts'
import type { GlyphSheet } from './hudGlyphText.ts'
import type { KillEntry } from './killfeed.ts'
import type { SessionMode } from './matchClock.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import { boltCycleMs, reloadMs, scopeOpenMs } from './scopeTiming.ts'
import type { ScopeView } from './scopeView.ts'
import { tenthsLabel } from './tenths.ts'

export type { HudScore } from './arenaHudCombatLog.ts'

/**
 * O hud de combate, visto de fora: uma interface que o jogo chama por evento,
 * nunca por quadro.
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
  /** Mostra ou esconde o hud. Casado com o fim do jack-in. */
  setVisible(visible: boolean): void
  /** Munição carregada e o que a arma está fazendo. Por evento, nunca por quadro. */
  setAmmo(loaded: number, phase: WeaponPhase): void
  /** Abates, sequência e pontos do jogador local. Por kill, nunca por quadro. */
  setScore(score: HudScore): void
  /** Segundos restantes. Só escreve no dom quando o segundo inteiro muda. */
  setTimeLeft(secondsLeft: number): void
  /** Partida ou treino. No treino o relógio não conta. */
  setMode(mode: SessionMode): void
  /**
   * Segundos de recarga do gancho restantes; 0 é pronto. Quem chama guarda o
   * décimo já escrito, como no aviso de fora da área.
   */
  setGrapple(remainingS: number): void
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
  /**
   * O aviso de fora da área de jogo, com os segundos que faltam; `null` o
   * apaga. Quem chama guarda o décimo já escrito e só chama quando ele muda.
   */
  setBoundaryWarning(remainingS: number | null): void
  dispose(): void
}

export interface ArenaHudOptions {
  readonly root: ElementQuery
  readonly config: GameplayConfig
  /** As medidas da folha de glifos da MG Rising (`fetchGlyphSheet`). */
  readonly glyphs: GlyphSheet
  /** O apelido do jogador, quando houver um. */
  readonly callsign?: string
}

/**
 * ```ts
 * const hud = createArenaHud({ root: document, config, glyphs })
 * hud.setVisible(true)
 * ```
 */
// raiz de composição: cada linha é uma ligação só, e quebrar em duas funções
// aqui inventaria um nível de indireção que não existe no problema.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: raiz de composição
export function createArenaHud(options: ArenaHudOptions): ArenaHud {
  const { root, config, glyphs } = options
  const hud = requireElement<HTMLElement>(root, '#arena-hud')
  const hitmarker = requireElement<HTMLElement>(root, '#hitmarker')
  const boundaryTitle = requireElement<HTMLElement>(root, '.boundary-title')
  const boundaryCountdown = requireElement<HTMLElement>(root, '.boundary-countdown')
  // o título é fixo: escrito uma vez aqui, para o texto ter uma cópia só.
  boundaryTitle.textContent = BOUNDARY_WARNING_TITLE
  writeDurations(hud, config)
  const status = createStatusPanel({ root, sheet: glyphs, config, callsign: options.callsign })
  const combatLog = createCombatLog(root, glyphs)
  const weapon = createWeaponPanel({ root, sheet: glyphs, config })
  const grapple = createGrapplePanel({ root, sheet: glyphs, config })
  const feeds = createKillFeeds(root)
  const state = { hitToggle: 'a' }
  const api: ArenaHud = {
    setVisible: (visible) => {
      hud.dataset.hud = visible ? 'live' : 'off'
    },
    setAmmo: weapon.setAmmo,
    setScore: (score) => {
      combatLog.setScore(score)
      status.setPoints(score.points)
    },
    setTimeLeft: status.setTimeLeft,
    setMode: status.setMode,
    setGrapple: grapple.setGrapple,
    pushKill: feeds.pushKill,
    pushMedals: (awards) => {
      combatLog.addMedals(awards.length)
      feeds.pushMedals(awards)
    },
    setBoundaryWarning: (remainingS) => writeBoundaryWarning(hud, boundaryCountdown, remainingS),
    showHitmarker: () => {
      // alternar o nome da animação é o que a reinicia: escrever o mesmo valor
      // numa propriedade não reinicia animação nenhuma (ver jackIn.css).
      state.hitToggle = state.hitToggle === 'a' ? 'b' : 'a'
      hitmarker.dataset.hit = state.hitToggle
    },
    showKillPoints: feeds.showKillPoints,
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
  api.setScore({ kills: 0, streak: 0, points: 0 })
  api.setTimeLeft(config.match.durationS)
  api.setGrapple(0)
  return api
}

/**
 * O tom vira atributo e o css decide cor e pisca; o número só é escrito com o
 * aviso no ar, porque apagado ele não é lido por ninguém.
 */
function writeBoundaryWarning(
  hud: HTMLElement,
  countdown: HTMLElement,
  remainingS: number | null,
): void {
  const tenths = boundaryTenths(remainingS)
  hud.dataset.boundary = boundaryTone(tenths)
  if (tenths === null) return
  countdown.textContent = tenthsLabel(tenths)
}

/** As durações do css saem do config, para a tela não contar tempo diferente do jogo. */
function writeDurations(hud: HTMLElement, config: GameplayConfig): void {
  hud.style.setProperty('--scope-open', `${scopeOpenMs(config)}ms`)
  hud.style.setProperty('--bolt-cycle', `${boltCycleMs(config)}ms`)
  hud.style.setProperty('--reload-time', `${reloadMs(config)}ms`)
}

/**
 * Hud que não faz nada. É o que o renderer usa quando não há hud montado — um
 * teste, ou um canvas sem a tela em volta.
 */
export function createSilentHud(): ArenaHud {
  return {
    setVisible: () => {},
    setAmmo: () => {},
    setScore: () => {},
    setTimeLeft: () => {},
    setMode: () => {},
    setGrapple: () => {},
    pushKill: () => {},
    showHitmarker: () => {},
    showKillPoints: () => {},
    pushMedals: () => {},
    setBoundaryWarning: () => {},
    open: () => {},
    close: () => {},
    dispose: () => {},
  }
}
