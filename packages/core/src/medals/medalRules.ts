import type { MedalsConfig } from '../config/gameplayConfig.ts'
import type { KillEvent } from '../scoring/killEvent.ts'
import { killsWithin, type PlayerScore } from '../scoring/scoreboard.ts'
import type { MedalSlug } from './medalCatalog.ts'

/**
 * Uma função pura por medalha, sobre o estado **anterior** à kill. A ordem
 * importa: `applyKill` zera a sequência da vítima, incrementa a da partida e
 * empurra o instante no anel de multikill, e as três coisas são exatamente o
 * que a `buzzkill`, o `first-blood` e a família de multikill leem. Por isso
 * `awardMedals` roda antes dele, e por isso as regras de multikill somam `1`:
 * esta kill ainda não está no anel.
 *
 * Cada regra é testada de mesa — entrada, evento, medalha esperada — e nenhuma
 * delas precisa de estado novo caro (`docs/medals.md`).
 */
export interface MedalSubject {
  readonly event: Readonly<KillEvent>
  /** O atirador antes desta kill. */
  readonly shooter: Readonly<PlayerScore>
  /** A vítima antes de morrer: a `streak` dela ainda é a que a `buzzkill` lê. */
  readonly victim: Readonly<PlayerScore>
  /** Kills da partida antes desta. Zero é o `first-blood`. */
  readonly matchKillsBefore: number
}

export interface MedalRule {
  readonly slug: MedalSlug
  readonly holds: (subject: MedalSubject, config: MedalsConfig) => boolean
}

/** Esta kill mais as que ainda cabem na janela que termina nela. */
export function multiKillCount(subject: MedalSubject, windowS: number): number {
  return killsWithin(subject.shooter, subject.event.atS, windowS) + 1
}

export const MEDAL_RULES: readonly MedalRule[] = [
  { slug: 'no-scope', holds: ({ event }) => event.weapon === 'sniper' && !event.scoped },
  { slug: 'knife', holds: ({ event }) => event.weapon === 'knife' },
  { slug: 'payback', holds: ({ event, shooter }) => shooter.lastKilledById === event.victimId },

  {
    slug: 'headshot',
    holds: ({ event }, config) => event.hitHeightRatio >= config.headshotHeightRatio,
  },
  { slug: 'double-kill', holds: (s, config) => multiKillCount(s, config.doubleKillWindowS) >= 2 },
  { slug: 'first-blood', holds: ({ matchKillsBefore }) => matchKillsBefore === 0 },
  { slug: 'airborne', holds: ({ event }) => event.shooterAirborne },
  {
    slug: 'backstab',
    holds: ({ event }, config) =>
      event.weapon === 'knife' && event.victimFacingAwayDeg > config.backstabAngleDeg,
  },
  { slug: 'skeet', holds: ({ event }) => event.victimAirborne },

  { slug: 'triple-kill', holds: (s, config) => multiKillCount(s, config.tripleKillWindowS) >= 3 },
  {
    slug: 'longshot-no-scope',
    holds: ({ event }, config) =>
      event.weapon === 'sniper' && !event.scoped && event.distanceM >= config.longshotM,
  },
  { slug: 'on-the-rope', holds: ({ event }) => event.shooterGrappling },
  { slug: 'buzzkill', holds: ({ victim }, config) => victim.streak >= config.buzzkillStreak },

  {
    slug: '360-no-scope',
    holds: ({ event }, config) =>
      event.weapon === 'sniper' &&
      !event.scoped &&
      event.shooterAirborne &&
      event.shooterYawTurnDeg >= config.spinDeg,
  },
  { slug: 'overkill', holds: (s, config) => multiKillCount(s, config.overkillWindowS) >= 4 },
  { slug: 'kill-chain', holds: (s, config) => multiKillCount(s, config.killChainWindowS) >= 5 },
  { slug: 'collateral', holds: ({ event }) => event.victimsInShot >= 2 },
]
