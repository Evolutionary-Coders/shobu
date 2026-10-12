import type { GameplayConfig, MedalAward, WeaponPhase } from '@shobu/core'
import { createBoundaryWarning } from './arenaHudBoundary.ts'
import { createCombatLog, type HudScore } from './arenaHudCombatLog.ts'
import { createDeathNotice } from './arenaHudDeathNotice.ts'
import { createKillFeeds } from './arenaHudFeeds.ts'
import { createGrapplePanel, createWeaponPanel } from './arenaHudLoadout.ts'
import { createScoreboardPanel } from './arenaHudScoreboard.ts'
import { createStatusPanel } from './arenaHudStatus.ts'
import { writeThinBar } from './hudComponentsDom.ts'
import type { GlyphSheet } from './hudGlyphText.ts'
import type { KillCard } from './killCards.ts'
import type { KillEntry } from './killfeed.ts'
import type { SessionMode } from './matchClock.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'
import { boltCycleMs, reloadMs, scopeOpenMs } from './scopeTiming.ts'
import type { ScopeView } from './scopeView.ts'
import type { ScoreboardRow } from './scoreboardRows.ts'

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
  /**
   * Há onde o gancho prender na mira, e ele está pronto: os colchetes da
   * retícula acendem. Quem chama só chama quando o valor muda.
   */
  setGrappleReach(inReach: boolean): void
  /**
   * O tanque da corrida tática plena, de 0 a 99 (`sprintTankPercent`), ou
   * `null` cheio, que apaga o indicador. Quem chama só chama quando o inteiro muda.
   */
  setSprintTank(percent: number | null): void
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
  /**
   * As linhas do placar do tab. Só quando o placar muda — quem chama compara a
   * revisão do placar —, nunca por quadro.
   */
  setScoreboard(rows: readonly ScoreboardRow[]): void
  /** Mostra ou esconde o placar: TAB, o botão de trás do controle ou o de toque, presos. */
  setScoreboardOpen(open: boolean): void
  /**
   * A tela de morte — quem matou o jogador, o retrato, a arma, como e de que
   * distância —, enquanto ele espera o respawn; `null` apaga.
   */
  setDeathNotice(card: KillCard | null): void
  /**
   * O nome de perfil do jogador, no alto do estado. Quem chama só chama quando
   * ele muda — na entrada da partida, se o jogador o trocou no menu.
   */
  setCallsign(name: string): void
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
  const sprintBar = requireElement<HTMLElement>(root, '#hud-sprint-bar')
  writeDurations(hud, config)
  const status = createStatusPanel({ root, sheet: glyphs, config, callsign: options.callsign })
  const combatLog = createCombatLog(root, glyphs)
  const weapon = createWeaponPanel({ root, sheet: glyphs, config })
  const grapple = createGrapplePanel({ root, sheet: glyphs, config })
  const feeds = createKillFeeds(root, glyphs)
  const boundary = createBoundaryWarning({ root, sheet: glyphs, config })
  const scoreboard = createScoreboardPanel(root, hud)
  const death = createDeathNotice(root, hud)
  const state = { hitToggle: 'a', glitchToggle: 'a' }
  const api: ArenaHud = {
    setVisible: (visible) => {
      hud.dataset.hud = visible ? 'live' : 'off'
      // o glitch do último abate ocuparia o lugar da animação de entrada dos
      // painéis na próxima vez que o visor acendesse.
      if (!visible) hud.removeAttribute('data-glitch')
    },
    setAmmo: weapon.setAmmo,
    setScore: (score) => {
      combatLog.setScore(score)
      status.setPoints(score.points)
    },
    setTimeLeft: status.setTimeLeft,
    setMode: status.setMode,
    setGrapple: grapple.setGrapple,
    setGrappleReach: (inReach) => {
      hud.dataset.grappleReach = inReach ? 'in' : 'out'
    },
    setSprintTank: (percent) => {
      hud.dataset.sprintTank = percent === null ? 'full' : 'draining'
      writeThinBar(sprintBar, (percent ?? 100) / 100)
    },
    pushKill: feeds.pushKill,
    pushMedals: (awards) => {
      combatLog.addMedals(awards.length)
      feeds.pushMedals(awards)
    },
    setBoundaryWarning: boundary.set,
    setScoreboard: scoreboard.setRows,
    setScoreboardOpen: scoreboard.setOpen,
    setDeathNotice: death.set,
    setCallsign: status.setCallsign,
    showHitmarker: () => {
      // alternar o nome da animação é o que a reinicia: escrever o mesmo valor
      // numa propriedade não reinicia animação nenhuma (ver jackIn.css).
      state.hitToggle = state.hitToggle === 'a' ? 'b' : 'a'
      hitmarker.dataset.hit = state.hitToggle
    },
    showKillPoints: (points, medals) => {
      feeds.showKillPoints(points, medals)
      // o abate do jogador estoura o visor (arenaVisor.css); alternar a/b é o
      // que reinicia a animação em abates seguidos, como no hitmarker.
      state.glitchToggle = state.glitchToggle === 'a' ? 'b' : 'a'
      hud.dataset.glitch = state.glitchToggle
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
  api.setScore({ kills: 0, streak: 0, points: 0 })
  api.setTimeLeft(config.match.durationS)
  api.setGrapple(0)
  return api
}

/** As durações do css saem do config, para a tela não contar tempo diferente do jogo. */
function writeDurations(hud: HTMLElement, config: GameplayConfig): void {
  hud.style.setProperty('--scope-open', `${scopeOpenMs(config)}ms`)
  hud.style.setProperty('--bolt-cycle', `${boltCycleMs(config)}ms`)
  hud.style.setProperty('--reload-time', `${reloadMs(config)}ms`)
  hud.style.setProperty('--respawn-delay', `${config.match.respawnDelayS * 1000}ms`)
}

/**
 * Hud que não faz nada. É o que o renderer usa quando não há hud montado — um
 * teste, ou um canvas sem a tela em volta.
 */
// a interface inteira, um evento por linha: é a lista que o tsc confere contra
// `ArenaHud`, e quebrá-la em duas funções esconderia o método que faltar.
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: tabela de eventos
export function createSilentHud(): ArenaHud {
  return {
    setVisible: () => {},
    setAmmo: () => {},
    setScore: () => {},
    setTimeLeft: () => {},
    setMode: () => {},
    setGrapple: () => {},
    setGrappleReach: () => {},
    setSprintTank: () => {},
    pushKill: () => {},
    showHitmarker: () => {},
    showKillPoints: () => {},
    pushMedals: () => {},
    setBoundaryWarning: () => {},
    setScoreboard: () => {},
    setScoreboardOpen: () => {},
    setDeathNotice: () => {},
    setCallsign: () => {},
    open: () => {},
    close: () => {},
    dispose: () => {},
  }
}
