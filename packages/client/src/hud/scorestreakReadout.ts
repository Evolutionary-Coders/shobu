import {
  type GameplayConfig,
  type ScorestreakNotice,
  type ScorestreakSlots,
  scorestreakBySlug,
  scorestreakCost,
} from '@shobu/core'
import { LOCAL_PLAYER_ID } from '../controller/arenaParts.ts'

/**
 * Uma linha das séries de pontuação no visor (ADR 0029): o nome, o custo, o
 * quanto os pontos da vida já pagaram, e se ela está pronta para acionar.
 */
export interface ScorestreakRow {
  readonly label: string
  readonly cost: number
  /** De 0 a 1: os pontos desde a última morte sobre o custo. */
  readonly progress: number
  readonly ready: boolean
}

/**
 * As três linhas, na ordem dos slots. A barra enche com os pontos da vida e
 * para cheia; quem diz se a série está pronta são os slots, e não a barra —
 * a série já dada nesta vida tem a barra cheia e não está pronta.
 *
 * ```ts
 * scorestreakRowsOf(slots, 200, config)[0] // { label: 'PING', cost: 400, progress: 0.5, ready: false }
 * ```
 */
export function scorestreakRowsOf(
  slots: Readonly<ScorestreakSlots>,
  points: number,
  config: GameplayConfig,
): readonly ScorestreakRow[] {
  return slots.loadout.map((slug, index) => {
    const cost = scorestreakCost(slug, config.scorestreaks)
    return {
      label: scorestreakBySlug(slug).label,
      cost,
      progress: Math.min(1, Math.max(0, points / cost)),
      ready: slots.ready[index] === true,
    }
  })
}

/**
 * O que muda as linhas, num número só: os pontos e as marcas de pronta. O
 * laço da tela roda por quadro, e só reescreve quando este número muda — a
 * troca de escolha, que muda as séries, quem confere é quem chama.
 *
 * ```ts
 * scorestreakReadoutKey(400, slots) // 400 * 8 + máscara das prontas
 * ```
 */
export function scorestreakReadoutKey(points: number, slots: Readonly<ScorestreakSlots>): number {
  let readyMask = 0
  for (const [index, ready] of slots.ready.entries()) if (ready) readyMask |= 1 << index
  return points * 8 + readyMask
}

/**
 * O aviso de série que vira legenda na tela, ou `null` para o que não se
 * anuncia: a série que outro jogador ganhou é dele, e só o acionamento é
 * público.
 *
 * ```ts
 * scorestreakToastOf({ kind: 'activated', playerId: 'local', slot: 0, scorestreak: 'ping' }, nameOf)
 * // 'PING ATIVADO'
 * ```
 */
export function scorestreakToastOf(
  notice: Readonly<ScorestreakNotice>,
  nameOf: (playerId: string) => string,
): string | null {
  const { label } = scorestreakBySlug(notice.scorestreak)
  const own = notice.playerId === LOCAL_PLAYER_ID
  if (!own) return notice.kind === 'activated' ? `${nameOf(notice.playerId)} ATIVOU ${label}` : null
  return notice.kind === 'earned' ? `${label} PRONTO` : `${label} ATIVADO`
}
