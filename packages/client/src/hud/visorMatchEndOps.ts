import {
  MATCH_OVER_TITLE,
  type MatchEndScreen,
  MVP_TITLE,
  type MvpCard,
  mvpStats,
  VOTE_TITLE,
  type VoteOptionView,
} from '../matchEnd/matchEndScreen.ts'
import type { ScoreboardRow } from './scoreboardRows.ts'
import { text, type VisorOp } from './visorDraw.ts'
import { VISOR_PALETTE, type VisorColor } from './visorPalette.ts'

/**
 * A tela do fim de partida no visor do óculos (ADR 0012): no estéreo o dom
 * não aparece, então o MVP, o placar final, o voto e a contagem viram
 * operações de canvas, no tamanho que a lente do cardboard lê. A mesma
 * `MatchEndScreen` do visor de dom.
 *
 * ```ts
 * for (const op of matchEndOps(screen, VISOR_SIZE)) paint(ctx, op)
 * ```
 */
export function matchEndOps(
  screen: MatchEndScreen,
  size: { readonly width: number; readonly height: number },
): readonly VisorOp[] {
  if (screen.phase === 'over') return overOps(size)
  return [
    { kind: 'plate', x: 40, y: 40, width: size.width - 80, height: size.height - 80 },
    { kind: 'chip', x: 64, y: 62, size: 34, text: '勝' },
    text(112, 90, MVP_TITLE, 24, VISOR_PALETTE.red, 'left', 'tech'),
    text(size.width - 64, 96, countLabel(screen), 44, VISOR_PALETTE.yellow, 'right', 'mono'),
    ...(screen.mvp ? mvpOps(screen.mvp) : []),
    ...standingsOps(screen.standings, 560),
    ...voteOps(screen, size.width),
  ]
}

/** FIM DE PARTIDA, grande, no centro: a arena congelada atrás. */
function overOps(size: { readonly width: number; readonly height: number }): readonly VisorOp[] {
  const centerX = size.width / 2
  return [
    { kind: 'chip', x: centerX - 24, y: size.height / 2 - 110, size: 48, text: '終' },
    text(centerX, size.height / 2, MATCH_OVER_TITLE, 64, VISOR_PALETTE.red, 'center', 'tech'),
  ]
}

function countLabel(screen: MatchEndScreen): string {
  return screen.phase === 'decided' ? '00' : String(screen.secondsLeft).padStart(2, '0')
}

const PORTRAIT_PX = 140

/** O retrato à esquerda, o nome ao lado, e os números embaixo, em duas colunas. */
function mvpOps(mvp: MvpCard): readonly VisorOp[] {
  const nameColor = mvp.local ? VISOR_PALETTE.yellow : VISOR_PALETTE.white
  const portrait: VisorOp[] =
    mvp.portraitUrl === undefined
      ? []
      : [{ kind: 'image', url: mvp.portraitUrl, x: 64, y: 120, size: PORTRAIT_PX }]
  const stats = mvpStats(mvp).flatMap((stat, index) => {
    const x = 64 + (index % 2) * 230
    const y = 300 + Math.floor(index / 2) * 52
    return [
      text(x, y, stat.label, 16, VISOR_PALETTE.grey, 'left', 'tech'),
      text(x, y + 30, stat.value, 30, VISOR_PALETTE.white, 'left', 'mono'),
    ]
  })
  return [...portrait, text(224, 180, mvp.name, 40, nameColor, 'left', 'tech'), ...stats]
}

const ROW_PX = 40

function standingsOps(rows: readonly ScoreboardRow[], left: number): readonly VisorOp[] {
  const right = left + 400
  return rows.flatMap((row, index) => {
    const y = 150 + index * ROW_PX
    const color: VisorColor = row.local ? VISOR_PALETTE.yellow : VISOR_PALETTE.white
    return [
      text(left, y, String(row.rank), 24, VISOR_PALETTE.grey, 'left', 'mono'),
      text(left + 40, y, row.name, 24, color, 'left', 'tech'),
      text(right - 90, y, String(row.points), 24, color, 'right', 'mono'),
      text(right, y, `${row.kills}/${row.deaths}`, 24, VISOR_PALETTE.grey, 'right', 'mono'),
    ]
  })
}

/** As opções lado a lado embaixo; com o voto fechado, o mapa que vem. */
function voteOps(screen: MatchEndScreen, width: number): readonly VisorOp[] {
  const columnPx = (width - 128) / Math.max(1, screen.options.length)
  const title =
    screen.nextMapLabel === undefined ? VOTE_TITLE : `${VOTE_TITLE}: ${screen.nextMapLabel}`
  return [
    text(width / 2, 452, title, 22, VISOR_PALETTE.red, 'center', 'tech'),
    ...screen.options.flatMap((option, index) =>
      voteOptionOps(option, index, 64 + index * columnPx + columnPx / 2),
    ),
  ]
}

function voteOptionOps(option: VoteOptionView, index: number, centerX: number): readonly VisorOp[] {
  const color = optionColor(option)
  const marker = option.focused ? '▸ ' : ''
  return [
    text(centerX, 500, `${marker}${index + 1} ${option.label}`, 24, color, 'center', 'tech'),
    text(centerX, 544, `${option.votes}`, 34, color, 'center', 'mono'),
    text(centerX, 574, option.voters.join(' · '), 14, VISOR_PALETTE.grey, 'center', 'tech'),
  ]
}

/** Vermelho para quem venceu, amarelo para o voto do jogador, branco para o resto. */
function optionColor(option: VoteOptionView): VisorColor {
  if (option.winner) return VISOR_PALETTE.red
  if (option.mine) return VISOR_PALETTE.yellow
  return option.focused ? VISOR_PALETTE.white : VISOR_PALETTE.grey
}
