import type { ScorestreakNotice } from '@shobu/core'
import { LOCAL_PLAYER_ID } from '../controller/arenaParts.ts'

/**
 * A chamada grande no alto da tela (`#hud-callout`) para o que mexe no radar
 * (ADR 0035). O aviso pequeno da série (`scorestreakToastOf`) continua; esta
 * diz o que a série **faz**, e é a que aparece no toque, onde o aviso some
 * (`touchHudLayout.css`). Na partida de todos contra todos, o PING de outro é
 * sempre de um inimigo. Chamam o PING e o ECO; o apagão do PULSO EMP tem a
 * chamada dele no visor, e as outras séries ficam no aviso pequeno.
 *
 * ```ts
 * radarCalloutOf({ kind: 'activated', playerId: 'local', slot: 0, scorestreak: 'ping' })
 * // 'PING ATIVO · INIMIGOS NO RADAR'
 * ```
 */
export function radarCalloutOf(notice: Readonly<ScorestreakNotice>): string | null {
  if (notice.kind !== 'activated') return null
  if (notice.scorestreak === 'ping') return pingCalloutOf(notice)
  if (notice.scorestreak === 'echo') return echoCalloutOf(notice)
  return null
}

function pingCalloutOf(notice: Readonly<ScorestreakNotice>): string {
  return notice.playerId === LOCAL_PLAYER_ID
    ? 'PING ATIVO · INIMIGOS NO RADAR'
    : 'PING INIMIGO DETECTADO'
}

/**
 * O ECO próprio diz se achou alvo — sem ninguém além de você com kill, ele
 * sai vazio, e a chamada não pode prometer um ponto que não vem. O de outro
 * só chama em quem ele marcou: o alvo sabe que está sendo seguido, os outros não.
 */
function echoCalloutOf(notice: Readonly<ScorestreakNotice>): string | null {
  if (notice.playerId === LOCAL_PLAYER_ID) {
    return notice.subjectId === undefined ? 'ECO SEM ALVO' : 'ECO ATIVO · SEU ALVO NO RADAR'
  }
  return notice.subjectId === LOCAL_PLAYER_ID ? 'ECO INIMIGO · VOCÊ ESTÁ MARCADO' : null
}
