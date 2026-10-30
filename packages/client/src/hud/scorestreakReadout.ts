import {
  type GameplayConfig,
  type ScorestreakNotice,
  type ScorestreakSlots,
  scorestreakBySlug,
  scorestreakCost,
} from '@shobu/core'
import { LOCAL_PLAYER_ID } from '../controller/arenaParts.ts'
import type { InputMethod } from '../controller/lastInputMethod.ts'
import { scorestreakIconUrl } from '../loadout/scorestreakCards.ts'

/**
 * Em que pé a série está nesta vida: `charging` enquanto os pontos não pagam,
 * `ready` quando os slots a dão, e `spent` depois de acionada — a barra fica
 * cheia, e a miniatura apaga até a próxima vida.
 */
export type ScorestreakPhase = 'charging' | 'ready' | 'spent'

/**
 * Uma linha das séries de pontuação no visor (ADR 0029): a miniatura, o nome,
 * o custo, o quanto os pontos da vida já pagaram, em que pé ela está, e a
 * tecla que a aciona.
 */
export interface ScorestreakRow {
  readonly label: string
  readonly iconUrl: string
  readonly cost: number
  /** De 0 a 1: os pontos desde a última morte sobre o custo. */
  readonly progress: number
  readonly phase: ScorestreakPhase
  /** A tecla do slot na entrada em uso (`scorestreakKeyHint`). */
  readonly keyHint: string
}

/**
 * A tecla de cada slot, por entrada: o 3, o 4 e o 5 do teclado (`heldKeys.ts`),
 * o ← → ↓ do direcional (`gamepadInput.ts`), e no toque o número escrito no
 * botão de cada série (`index.html`).
 */
const KEY_HINTS: Readonly<Record<InputMethod, readonly string[]>> = {
  keyboard: ['3', '4', '5'],
  gamepad: ['←', '→', '↓'],
  touch: ['1', '2', '3'],
}

/**
 * ```ts
 * scorestreakKeyHint(1, 'gamepad') // '→'
 * ```
 */
export function scorestreakKeyHint(slot: number, method: InputMethod): string {
  const hint = KEY_HINTS[method][slot]
  if (hint === undefined) {
    throw new RangeError(`scorestreakKeyHint recebeu o slot ${slot}; esperado 0, 1 ou 2`)
  }
  return hint
}

/**
 * As três linhas, na ordem dos slots. A barra enche com os pontos da vida e
 * para cheia; quem diz se a série está pronta são os slots, e não a barra —
 * a série já dada nesta vida tem a barra cheia e não está pronta.
 *
 * ```ts
 * scorestreakRowsOf(slots, 200, config, 'keyboard')[0]
 * // { label: 'PING', cost: 400, progress: 0.5, phase: 'charging', keyHint: '3', ... }
 * ```
 */
export function scorestreakRowsOf(
  slots: Readonly<ScorestreakSlots>,
  points: number,
  config: GameplayConfig,
  method: InputMethod,
): readonly ScorestreakRow[] {
  return slots.loadout.map((slug, index) => {
    const cost = scorestreakCost(slug, config.scorestreaks)
    const progress = Math.min(1, Math.max(0, points / cost))
    return {
      label: scorestreakBySlug(slug).label,
      iconUrl: scorestreakIconUrl(slug),
      cost,
      progress,
      phase: phaseOf(slots.ready[index] === true, progress),
      keyHint: scorestreakKeyHint(index, method),
    }
  })
}

function phaseOf(ready: boolean, progress: number): ScorestreakPhase {
  if (ready) return 'ready'
  return progress < 1 ? 'charging' : 'spent'
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

/** A legenda de uma série: o texto, e a miniatura dela ao lado. */
export interface ScorestreakToast {
  readonly text: string
  readonly iconUrl: string
}

/**
 * O aviso de série que vira legenda na tela, ou `null` para o que não se
 * anuncia: a série que outro jogador ganhou é dele, e só o acionamento é
 * público.
 *
 * ```ts
 * scorestreakToastOf({ kind: 'activated', playerId: 'local', slot: 0, scorestreak: 'ping' }, nameOf)
 * // { text: 'PING ATIVADO', iconUrl: '/assets/images/scorestreaks/ping.svg' }
 * ```
 */
export function scorestreakToastOf(
  notice: Readonly<ScorestreakNotice>,
  nameOf: (playerId: string) => string,
): ScorestreakToast | null {
  const text = toastTextOf(notice, nameOf)
  return text === null ? null : { text, iconUrl: scorestreakIconUrl(notice.scorestreak) }
}

function toastTextOf(
  notice: Readonly<ScorestreakNotice>,
  nameOf: (playerId: string) => string,
): string | null {
  const { label } = scorestreakBySlug(notice.scorestreak)
  const own = notice.playerId === LOCAL_PLAYER_ID
  if (!own) return notice.kind === 'activated' ? `${nameOf(notice.playerId)} ATIVOU ${label}` : null
  return notice.kind === 'earned' ? `${label} PRONTO` : `${label} ATIVADO`
}
