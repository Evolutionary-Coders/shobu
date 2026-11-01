import type { MatchPhase } from '@shobu/core'
import { openPublicRooms, pendingSeatsAt, type RoomDirectory } from './roomDirectory.ts'

/**
 * O que a partida rápida precisa saber de uma sala aberta, lido da simulação
 * dela na hora da entrada.
 */
export interface RoomStanding {
  /** Os assentos de gente, contando o de quem recarrega a página e vai voltar. */
  readonly humans: number
  readonly phase: MatchPhase
  /** Os segundos que faltam na fase de agora (`matchPhaseLeftS`). */
  readonly phaseLeftS: number
  readonly arenaId: string
}

/**
 * Abaixo disto, a partida em andamento já está no fim: quem cai nela joga uns
 * segundos e vai para o resultado. Uma sala no intervalo começa uma partida
 * inteira em uns 10 s, e por isso vem antes (ADR 0032).
 */
export const QUICK_MATCH_LATE_JOIN_S = 60

/**
 * As salas públicas com vaga, da melhor para a pior, para a partida rápida
 * tentar uma de cada vez. A ordem:
 * 1. Dá para jogar agora: aquecimento, ou partida com pelo menos
 *    `QUICK_MATCH_LATE_JOIN_S` pela frente. Depois o intervalo (fim,
 *    resultado, voto), e por último a partida que está acabando.
 * 2. A mais cheia, contando quem já tem assento a caminho dela.
 * 3. A que tem mais partida pela frente; no intervalo, a que recomeça antes.
 * 4. O mesmo mapa de quem entra, que assim não recarrega a página.
 * 5. O endereço, para a ordem não depender da ordem do mapa.
 *
 * Sala sem `standing` (nascendo, ou fechando) fica de fora.
 *
 * ```ts
 * rankQuickMatchRooms(directory, (address) => standings.get(address)?.(), hasVacancy, 'neon-kaido')
 * ```
 */
export function rankQuickMatchRooms(
  directory: RoomDirectory,
  standingOf: (address: string) => RoomStanding | undefined,
  hasVacancy: (address: string) => boolean,
  wantedArenaId: string,
): readonly string[] {
  const candidates: QuickMatchCandidate[] = []
  for (const address of openPublicRooms(directory, hasVacancy)) {
    const standing = standingOf(address)
    if (standing === undefined) continue
    candidates.push({
      address,
      standing,
      fullness: standing.humans + pendingSeatsAt(directory, address),
    })
  }
  const compare = compareCandidates(wantedArenaId)
  return candidates.sort(compare).map((candidate) => candidate.address)
}

interface QuickMatchCandidate {
  readonly address: string
  readonly standing: RoomStanding
  readonly fullness: number
}

function compareCandidates(
  wantedArenaId: string,
): (a: QuickMatchCandidate, b: QuickMatchCandidate) => number {
  return (a, b) =>
    bucketOf(a.standing) - bucketOf(b.standing) ||
    b.fullness - a.fullness ||
    compareTimeAhead(a.standing, b.standing) ||
    sameArena(b.standing, wantedArenaId) - sameArena(a.standing, wantedArenaId) ||
    a.address.localeCompare(b.address)
}

/** 0: dá para jogar agora; 1: intervalo; 2: partida no fim. */
function bucketOf(standing: RoomStanding): number {
  if (standing.phase === 'warmup') return 0
  if (standing.phase !== 'live') return 1
  return standing.phaseLeftS >= QUICK_MATCH_LATE_JOIN_S ? 0 : 2
}

/**
 * A ordem das fases para quem entra: o aquecimento tem a partida inteira pela
 * frente, mais que qualquer partida em andamento; no intervalo, a fase mais
 * adiante é a que recomeça antes.
 */
const PHASE_AHEAD: Readonly<Record<MatchPhase, number>> = {
  live: 0,
  warmup: 1,
  over: 0,
  results: 1,
  decided: 2,
}

/** Negativo quando `a` tem mais partida pela frente que `b`. */
function compareTimeAhead(a: RoomStanding, b: RoomStanding): number {
  const byPhase = PHASE_AHEAD[b.phase] - PHASE_AHEAD[a.phase]
  if (byPhase !== 0) return byPhase
  // no aquecimento e na partida, mais tempo na fase é mais partida; no
  // intervalo, menos tempo na fase é recomeçar antes.
  const playing = a.phase === 'warmup' || a.phase === 'live'
  return playing ? b.phaseLeftS - a.phaseLeftS : a.phaseLeftS - b.phaseLeftS
}

function sameArena(standing: RoomStanding, wantedArenaId: string): number {
  return standing.arenaId === wantedArenaId ? 1 : 0
}
