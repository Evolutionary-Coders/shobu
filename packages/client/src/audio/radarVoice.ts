import type { ScorestreakNotice } from '@shobu/core'
import { LOCAL_PLAYER_ID } from '../controller/arenaParts.ts'
import { MATCH_MARK_PRIORITY } from './narratorQueue.ts'

/**
 * O PING no ar vale um marco de partida: muda o que o jogador deve fazer
 * agora — caçar, ou sair da vista —, acima da medalha comum.
 */
export const RADAR_VOICE_PRIORITY = MATCH_MARK_PRIORITY

/** As falas do radar (`scripts/narrator/lines.md`, ADR 0035). */
export type RadarVoiceSlug = 'scorestreak-ping' | 'enemy-ping'

/**
 * A fala do narrador para o acionamento, ou `undefined`: o PING próprio diz
 * que o radar está no ar, e o de outro diz que o jogador está no radar dele.
 * Sem o take gravado, o narrador fica mudo (`pickTake`), e a chamada em texto
 * (`radarCalloutOf`) segue dizendo o mesmo.
 *
 * ```ts
 * radarVoiceOf({ kind: 'activated', playerId: 'bot-0', slot: 0, scorestreak: 'ping' }) // 'enemy-ping'
 * ```
 */
export function radarVoiceOf(notice: Readonly<ScorestreakNotice>): RadarVoiceSlug | undefined {
  if (notice.kind !== 'activated' || notice.scorestreak !== 'ping') return undefined
  return notice.playerId === LOCAL_PLAYER_ID ? 'scorestreak-ping' : 'enemy-ping'
}
