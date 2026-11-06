import type { ScorestreakNotice } from '@shobu/core'
import { LOCAL_PLAYER_ID } from '../controller/arenaParts.ts'

/**
 * A chamada grande no alto da tela (`#hud-callout`) para o que mexe no radar
 * (ADR 0035). O aviso pequeno da série (`scorestreakToastOf`) continua; esta
 * diz o que a série **faz**, e é a que aparece no toque, onde o aviso some
 * (`touchHudLayout.css`). Na partida de todos contra todos, o PING de outro é
 * sempre de um inimigo.
 *
 * ```ts
 * radarCalloutOf({ kind: 'activated', playerId: 'local', slot: 0, scorestreak: 'ping' })
 * // 'PING ATIVO · INIMIGOS NO RADAR'
 * ```
 */
export function radarCalloutOf(notice: Readonly<ScorestreakNotice>): string | null {
  if (notice.kind !== 'activated') return null
  const own = notice.playerId === LOCAL_PLAYER_ID
  if (notice.scorestreak === 'ping') {
    return own ? 'PING ATIVO · INIMIGOS NO RADAR' : 'PING INIMIGO DETECTADO'
  }
  if (notice.scorestreak === 'counter-ping') {
    return own ? 'CONTRA-PING ATIVO · RADAR INIMIGO CEGO' : 'CONTRA-PING · RADAR EMBARALHADO'
  }
  return null
}
