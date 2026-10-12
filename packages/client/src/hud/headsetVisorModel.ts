import type { WeaponPhase } from '@shobu/core'
import type { MatchEndScreen } from '../matchEnd/matchEndScreen.ts'
import { BOUNDARY_WARNING_TITLE, boundaryTone } from './boundaryWarning.ts'
import { type GrappleReadout, grappleReadout } from './grappleReadout.ts'
import type { KillCard } from './killCards.ts'
import { KILL_BANNER_MS } from './killCards.ts'
import { clockLabel, clockTone, type SessionMode } from './matchClock.ts'
import type { ScoreboardRow } from './scoreboardRows.ts'
import { tenthsLabel } from './tenths.ts'
import { captionOps } from './visorCaptionOps.ts'
import { deathCardOps, killBannerOps } from './visorCardOps.ts'
import { bar, text, type VisorOp } from './visorDraw.ts'
import { ammoLabels, killPointsParts, pointsLabel, weaponStatus } from './visorFields.ts'
import { matchEndOps } from './visorMatchEndOps.ts'
import { VISOR_PALETTE, type VisorColor } from './visorPalette.ts'

export type { VisorAlign, VisorFont, VisorOp } from './visorDraw.ts'

/**
 * O visor do óculos como dado (ADR 0012/0013): o mesmo hud do desktop, na
 * mesma linguagem, mas desenhado numa textura presa à frente da cabeça, porque
 * o dom não aparece no estéreo. Este módulo guarda o estado e diz **o que**
 * desenhar; quem pinta o canvas é `headsetVisor.ts`.
 *
 * A textura cobre os ~60° centrais de cada olho: a borda da lente do cardboard
 * borra, e informação no canto que ninguém consegue ler é enfeite.
 */
export const VISOR_SIZE = { width: 1024, height: 640 } as const

/** Quanto o hitmarker fica na tela. O do desktop dura o mesmo (arenaReticle.css). */
export const VISOR_HIT_MS = 220

/** Quanto os pontos do abate ficam na tela. */
export const VISOR_KILL_POP_MS = 1_400

const MARGIN = 40

export interface KillPop {
  readonly text: string
  readonly medals: readonly string[]
  readonly untilMs: number
}

/** O cartão de abate no ar, e até quando. */
export interface KillBannerPop {
  readonly card: KillCard
  readonly untilMs: number
}

export interface VisorState {
  mode: SessionMode
  /** As linhas do placar, prontas; só aparecem com `scoreboardOpen`. */
  scoreboard: readonly ScoreboardRow[]
  scoreboardOpen: boolean
  /** A tela de morte, enquanto ele espera o respawn; `null` vivo. */
  death: KillCard | null
  secondsLeft: number
  points: number
  kills: number
  streak: number
  ammo: number
  phase: WeaponPhase
  grapple: GrappleReadout
  /** Superfície ao alcance na mira: o mostrador do gancho acende em amarelo. */
  grappleReach: boolean
  boundaryTenths: number | null
  scoped: boolean
  hitUntilMs: number
  killPop: KillPop | null
  killBanner: KillBannerPop | null
  /** A fala do narrador que está soando (`narratorCaptions.ts`), ou `null`. */
  caption: string | null
  /** A tela do fim de partida (`matchEndScreen.ts`), ou `null` com a partida correndo. */
  matchEnd: MatchEndScreen | null
}

/** O que o visor precisa saber do jogo para desenhar. */
export interface VisorConfig {
  readonly magazineRounds: number
  readonly grappleCooldownS: number
}

export function createVisorState(config: VisorConfig, secondsLeft: number): VisorState {
  return {
    mode: 'match',
    scoreboard: [],
    scoreboardOpen: false,
    death: null,
    secondsLeft,
    points: 0,
    kills: 0,
    streak: 0,
    ammo: config.magazineRounds,
    phase: 'ready',
    grapple: grappleReadout(0, config.grappleCooldownS),
    grappleReach: false,
    boundaryTenths: null,
    scoped: false,
    hitUntilMs: 0,
    killPop: null,
    killBanner: null,
    caption: null,
    matchEnd: null,
  }
}

/**
 * Os pontos de um abate, com as medalhas logo abaixo, por um tempo.
 *
 * ```ts
 * popKill(state, 100, ['DUPLA'], now) // '+100' até now + VISOR_KILL_POP_MS
 * ```
 */
export function popKill(
  state: VisorState,
  points: number,
  medals: readonly string[],
  nowMs: number,
): void {
  const { sign, digits } = killPointsParts(points)
  state.killPop = { text: `${sign}${digits}`, medals, untilMs: nowMs + VISOR_KILL_POP_MS }
}

/**
 * O cartão de abate, pelo mesmo tempo do desktop (`KILL_BANNER_MS`). O abate
 * seguinte troca o cartão, como lá.
 *
 * ```ts
 * popKillBanner(state, card, now) // no ar até now + KILL_BANNER_MS
 * ```
 */
export function popKillBanner(state: VisorState, card: KillCard, nowMs: number): void {
  state.killBanner = { card, untilMs: nowMs + KILL_BANNER_MS }
}

/**
 * O que desenhar agora, de trás para frente: a máscara da luneta primeiro, para
 * os números ficarem por cima dela.
 *
 * ```ts
 * for (const op of visorOps(state, performance.now(), config)) paint(ctx, op)
 * ```
 */
export function visorOps(
  state: VisorState,
  nowMs: number,
  config: VisorConfig,
): readonly VisorOp[] {
  // no fim de partida o hud de combate sai de cena: munição e gancho de uma
  // arena congelada seriam números que não dizem mais nada.
  if (state.matchEnd) {
    return [
      { kind: 'brackets', inset: 12, length: 44 },
      ...matchEndOps(state.matchEnd, VISOR_SIZE),
      ...captionOps(state.caption, VISOR_SIZE.width),
    ]
  }
  return [
    ...scopeOps(state),
    { kind: 'brackets', inset: 12, length: 44 },
    ...clockOps(state),
    ...scoreOps(state),
    ...ammoOps(state, config),
    ...grappleOps(state),
    ...boundaryOps(state),
    ...hitOps(state, nowMs),
    ...killPopOps(state, nowMs),
    ...bannerOps(state, nowMs),
    ...captionOps(state.caption, VISOR_SIZE.width),
    ...deathOps(state),
    ...scoreboardOps(state),
  ]
}

/**
 * Quando o visor muda sozinho, sem evento: o hitmarker e os pontos do abate
 * expiram. É o que deixa o adapter redesenhar por evento, e não por quadro.
 */
export function nextVisorChangeMs(state: VisorState, nowMs: number): number {
  const pending = [
    state.hitUntilMs,
    state.killPop?.untilMs ?? 0,
    state.killBanner?.untilMs ?? 0,
  ].filter((ms) => ms > nowMs)
  return pending.length > 0 ? Math.min(...pending) : Number.POSITIVE_INFINITY
}

const CLOCK_COLOR: Readonly<Record<ReturnType<typeof clockTone>, VisorColor>> = {
  calm: VISOR_PALETTE.white,
  urgent: VISOR_PALETTE.orange,
  final: VISOR_PALETTE.red,
}

function clockOps(state: VisorState): readonly VisorOp[] {
  const color =
    state.mode === 'training' ? VISOR_PALETTE.white : CLOCK_COLOR[clockTone(state.secondsLeft)]
  return [
    { kind: 'chip', x: MARGIN, y: MARGIN, size: 40, text: '時' },
    text(
      MARGIN + 54,
      MARGIN + 34,
      clockLabel(state.mode, state.secondsLeft),
      48,
      color,
      'left',
      'mono',
    ),
    text(MARGIN, MARGIN + 82, pointsLabel(state.points), 22, VISOR_PALETTE.grey, 'left', 'mono'),
  ]
}

function scoreOps(state: VisorState): readonly VisorOp[] {
  const right = VISOR_SIZE.width - MARGIN
  return [
    { kind: 'chip', x: right - 120, y: MARGIN, size: 40, text: '殺' },
    text(right, MARGIN + 34, `${state.kills}`, 44, VISOR_PALETTE.white, 'right', 'mono'),
    { kind: 'chip', x: right - 120, y: MARGIN + 56, size: 40, text: '連' },
    text(right, MARGIN + 90, `${state.streak}`, 44, VISOR_PALETTE.yellow, 'right', 'mono'),
  ]
}

function ammoOps(state: VisorState, config: VisorConfig): readonly VisorOp[] {
  const right = VISOR_SIZE.width - MARGIN
  const bottom = VISOR_SIZE.height - MARGIN
  const labels = ammoLabels(state.ammo, config.magazineRounds)
  const color = state.ammo === 0 ? VISOR_PALETTE.red : VISOR_PALETTE.yellow
  return [
    { kind: 'chip', x: right - 170, y: bottom - 150, size: 34, text: '弾' },
    text(
      right,
      bottom - 124,
      weaponStatus(state.ammo, state.phase),
      22,
      VISOR_PALETTE.red,
      'right',
      'tech',
    ),
    text(right - 70, bottom - 26, labels.loaded, 88, color, 'right', 'mono'),
    text(right, bottom - 26, labels.magazine, 36, VISOR_PALETTE.white, 'right', 'mono'),
    bar(right - 260, bottom - 8, 260, 6, state.ammo / config.magazineRounds, color),
  ]
}

/**
 * No óculos a retícula é uma malha da cena, e não o svg do visor de dom: o
 * aviso de alcance acende o mostrador do gancho, em amarelo, no lugar dos
 * colchetes.
 */
function grappleOps(state: VisorState): readonly VisorOp[] {
  const bottom = VISOR_SIZE.height - MARGIN
  const color = grappleColor(state)
  return [
    { kind: 'chip', x: MARGIN, y: bottom - 74, size: 34, text: '鉤' },
    text(MARGIN + 48, bottom - 46, state.grapple.label, 30, color, 'left', 'tech'),
    bar(MARGIN, bottom - 8, 220, 4, state.grapple.charge, VISOR_PALETTE.white),
  ]
}

function grappleColor(state: VisorState): VisorColor {
  if (state.grapple.state !== 'ready') return VISOR_PALETTE.grey
  return state.grappleReach ? VISOR_PALETTE.yellow : VISOR_PALETTE.white
}

function boundaryOps(state: VisorState): readonly VisorOp[] {
  const tone = boundaryTone(state.boundaryTenths)
  if (tone === 'off' || state.boundaryTenths === null) return []
  const color = tone === 'critical' ? VISOR_PALETTE.red : VISOR_PALETTE.orange
  const centerX = VISOR_SIZE.width / 2
  return [
    text(centerX, 150, BOUNDARY_WARNING_TITLE, 34, color, 'center', 'tech'),
    text(centerX, 214, tenthsLabel(state.boundaryTenths), 60, color, 'center', 'mono'),
  ]
}

function hitOps(state: VisorState, nowMs: number): readonly VisorOp[] {
  return nowMs < state.hitUntilMs ? [{ kind: 'hitmarker', size: 44 }] : []
}

function killPopOps(state: VisorState, nowMs: number): readonly VisorOp[] {
  const pop = state.killPop
  if (!pop || nowMs >= pop.untilMs) return []
  const x = VISOR_SIZE.width / 2 + 110
  const y = VISOR_SIZE.height / 2 - 50
  const medals = pop.medals.map((medal, index) =>
    text(x, y + 34 + index * 26, medal, 22, VISOR_PALETTE.white, 'left', 'tech'),
  )
  return [text(x, y, pop.text, 48, VISOR_PALETTE.yellow, 'left', 'mono'), ...medals]
}

function bannerOps(state: VisorState, nowMs: number): readonly VisorOp[] {
  const banner = state.killBanner
  return banner && nowMs < banner.untilMs ? killBannerOps(banner.card) : []
}

/** A tela de morte, no alto do centro, como no desktop (`visorCardOps.ts`). */
function deathOps(state: VisorState): readonly VisorOp[] {
  return state.death === null ? [] : deathCardOps(state.death)
}

/** Altura de uma linha do placar no visor: legível na lente, quatro linhas cabem no centro. */
const SCOREBOARD_ROW_PX = 52
const SCOREBOARD_WIDTH_PX = 640

/**
 * O placar do tab no óculos: a mesma tabela, por cima de uma placa escura,
 * no centro — que é a parte da lente que não borra. Posição, nome, pontos e
 * abates/mortes; o jogador em amarelo.
 */
function scoreboardOps(state: VisorState): readonly VisorOp[] {
  if (!state.scoreboardOpen) return []
  const left = (VISOR_SIZE.width - SCOREBOARD_WIDTH_PX) / 2
  const top = 150
  const height = 70 + state.scoreboard.length * SCOREBOARD_ROW_PX
  return [
    { kind: 'plate', x: left, y: top, width: SCOREBOARD_WIDTH_PX, height },
    { kind: 'chip', x: left + 16, y: top + 14, size: 34, text: '表' },
    text(left + 62, top + 42, 'PLACAR', 24, VISOR_PALETTE.red, 'left', 'tech'),
    ...state.scoreboard.flatMap((row, index) =>
      scoreboardRowOps(row, left, top + 100 + index * SCOREBOARD_ROW_PX),
    ),
  ]
}

function scoreboardRowOps(row: ScoreboardRow, left: number, baseline: number): readonly VisorOp[] {
  const color = row.local ? VISOR_PALETTE.yellow : VISOR_PALETTE.white
  const right = left + SCOREBOARD_WIDTH_PX - 20
  return [
    text(left + 20, baseline, String(row.rank), 30, VISOR_PALETTE.grey, 'left', 'mono'),
    text(left + 70, baseline, row.name, 30, color, 'left', 'tech'),
    text(right - 150, baseline, String(row.points), 30, color, 'right', 'mono'),
    text(right, baseline, `${row.kills}/${row.deaths}`, 30, VISOR_PALETTE.grey, 'right', 'mono'),
  ]
}

/** A máscara da luneta: no óculos a ampliação é baixa, e o anel é que diz "mirando". */
function scopeOps(state: VisorState): readonly VisorOp[] {
  return state.scoped ? [{ kind: 'scope', radius: VISOR_SIZE.height * 0.44 }] : []
}
