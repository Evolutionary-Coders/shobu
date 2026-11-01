import {
  createLeadershipWatch,
  leadershipCalloutSince,
  type MatchConfig,
  type MatchPhase,
  type Scoreboard,
} from '@shobu/core'
import { leadershipCalloutText } from '../hud/leadershipCallout.ts'
import type { SessionMode } from '../hud/matchClock.ts'
import type { Narrator } from './narrator.ts'
import { LEAD_PRIORITY } from './narratorQueue.ts'

/**
 * Quem leva as falas de liderança (`leadership.ts`) ao jogador: a voz, se ela
 * tem o take, e senão o texto no hud — uma fala nova fica no texto até a
 * bancada gravá-la, e as vozes rvc ficam nele de vez.
 *
 * Só com a partida valendo: no aquecimento ninguém pontua, no intervalo o
 * placar é o final, e no treino não há partida a liderar (como os marcos de
 * `matchMarks.ts`).
 *
 * ```ts
 * const leadership = createLeadershipAnnouncer({ narrator, showCallout: hud.showCallout })
 * leadership.frame(stage, session.scoreboard, LOCAL_PLAYER_ID, config.match)
 * ```
 */
export interface LeadershipOutlets {
  readonly narrator: Pick<Narrator, 'has' | 'say'>
  showCallout(text: string): void
}

/** O que o quadro diz da partida: a fase, o modo, e se o jogador está na arena. */
export interface LeadershipStage {
  readonly inArena: boolean
  readonly mode: SessionMode
  readonly phase: MatchPhase
  /** O relógio da fila do narrador (`narratorQueue.ts`). */
  readonly nowS: number
}

export interface LeadershipAnnouncer {
  frame(
    stage: Readonly<LeadershipStage>,
    board: Readonly<Scoreboard>,
    localId: string,
    match: Readonly<MatchConfig>,
  ): void
}

export function createLeadershipAnnouncer(outlets: LeadershipOutlets): LeadershipAnnouncer {
  const watch = createLeadershipWatch()
  return {
    frame: (stage, board, localId, match) => {
      if (!stage.inArena || stage.mode === 'training' || stage.phase !== 'live') return
      const callout = leadershipCalloutSince(watch, board, localId, match)
      if (!callout) return
      if (outlets.narrator.has(callout)) {
        outlets.narrator.say(callout, LEAD_PRIORITY, stage.nowS)
        return
      }
      outlets.showCallout(leadershipCalloutText(callout))
    },
  }
}
