import type { RadarConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'
import type { ScorestreakNotice } from './scorestreakLedger.ts'

/**
 * O PING que está varrendo: até quando dura e quando sai a próxima varredura.
 * Os tempos são o relógio da partida de quem chama, nunca o de parede (ADR 0003).
 */
export interface RadarPulse {
  readonly endsAtS: number
  readonly sweepEveryS: number
  nextSweepAtS: number
}

/**
 * O radar de uma partida (ADR 0035): os PINGs varrendo, por dono, e os
 * CONTRA-PINGs embaralhando, por quem acionou. O mesmo estado serve a sala do
 * servidor, que decide as varreduras, e o cliente, que só lê o embaralhamento
 * e o tempo que falta para pintar o hud.
 */
export interface RadarState {
  readonly pulses: Map<string, RadarPulse>
  /** Quem acionou o CONTRA-PING → quando ele acaba. */
  readonly jams: Map<string, number>
}

/** O que o radar precisa de um combatente: o `Fighter` cabe aqui sem cópia. */
export interface RadarFighterView {
  readonly id: string
  readonly alive: boolean
  readonly body: { readonly position: Readonly<Vector3> }
}

/** Um inimigo na varredura, pelo pé, em metros. */
export interface RadarBlip {
  readonly id: string
  readonly xM: number
  readonly yM: number
  readonly zM: number
}

/** A varredura de um dono: os inimigos daquele instante e quanto falta de PING. */
export interface RadarSweep {
  readonly ownerId: string
  readonly blips: readonly RadarBlip[]
  readonly pulseLeftS: number
}

/**
 * O radar vazio.
 *
 * ```ts
 * const radar = createRadarState()
 * ```
 */
export function createRadarState(): RadarState {
  return { pulses: new Map(), jams: new Map() }
}

/**
 * O acionamento que mexe no radar: PING começa a varrer já, CONTRA-PING
 * embaralha os outros. Qualquer outra série, e o aviso de série ganha, não
 * fazem nada — SONAR, EMP e a camuflagem entram aqui quando tiverem efeito.
 * Acionar de novo o que está rodando recomeça a contagem.
 *
 * ```ts
 * for (const notice of notices) applyRadarActivation(radar, notice, matchTimeS, config.radar)
 * ```
 */
export function applyRadarActivation(
  state: RadarState,
  notice: Readonly<ScorestreakNotice>,
  nowS: number,
  config: RadarConfig,
): void {
  if (notice.kind !== 'activated') return
  if (notice.scorestreak === 'ping') {
    state.pulses.set(notice.playerId, {
      endsAtS: nowS + config.pingDurationS,
      sweepEveryS: config.pingSweepEveryS,
      nextSweepAtS: nowS,
    })
    return
  }
  if (notice.scorestreak === 'counter-ping') {
    state.jams.set(notice.playerId, nowS + config.counterPingDurationS)
  }
}

/**
 * Se o radar de `viewerId` está embaralhado agora: um CONTRA-PING de outra
 * pessoa ainda rodando. O de quem acionou não embaralha o próprio radar.
 *
 * ```ts
 * if (isRadarJammedFor(radar, LOCAL_PLAYER_ID, nowS)) hud.setMinimap({ jammed: true, ... })
 * ```
 */
export function isRadarJammedFor(state: RadarState, viewerId: string, nowS: number): boolean {
  for (const [jammerId, endsAtS] of state.jams) {
    if (jammerId !== viewerId && nowS < endsAtS) return true
  }
  return false
}

/**
 * Quanto falta do PING de `ownerId`, ou 0 sem PING rodando — é a barra do hud.
 *
 * ```ts
 * radarPulseLeftS(radar, LOCAL_PLAYER_ID, nowS) // 9.5
 * ```
 */
export function radarPulseLeftS(state: RadarState, ownerId: string, nowS: number): number {
  const pulse = state.pulses.get(ownerId)
  if (!pulse) return 0
  return Math.max(0, pulse.endsAtS - nowS)
}

/**
 * Os inimigos que a varredura de `ownerId` vê: os vivos, menos o dono. É o
 * gancho da camuflagem óptica quando ela tiver efeito.
 *
 * ```ts
 * radarBlipsFor('local', fighters) // [{ id: 'bot-0', xM: 4, yM: 0, zM: -12 }]
 * ```
 */
export function radarBlipsFor(ownerId: string, fighters: readonly RadarFighterView[]): RadarBlip[] {
  const blips: RadarBlip[] = []
  for (const fighter of fighters) {
    if (!fighter.alive || fighter.id === ownerId) continue
    const { x, y, z } = fighter.body.position
    blips.push({ id: fighter.id, xM: x, yM: y, zM: z })
  }
  return blips
}

/**
 * O passo do radar: cada PING com varredura vencida varre e marca a próxima,
 * e o que acabou sai. O dono embaralhado não recebe a varredura — ela se
 * perde, e a próxima sai no horário dela. As varreduras vão para `into`.
 *
 * ```ts
 * stepRadarPulses(radar, room.matchTimeS, fighters, sweeps)
 * ```
 */
export function stepRadarPulses(
  state: RadarState,
  nowS: number,
  fighters: readonly RadarFighterView[],
  into: RadarSweep[],
): void {
  for (const [ownerId, pulse] of state.pulses) {
    if (isSweepDue(pulse, nowS)) sweepPulse(state, ownerId, pulse, nowS, fighters, into)
    if (nowS >= pulse.endsAtS) state.pulses.delete(ownerId)
  }
  for (const [jammerId, endsAtS] of state.jams) {
    if (nowS >= endsAtS) state.jams.delete(jammerId)
  }
}

/**
 * A folga do fim do PING. O horário da varredura soma o intervalo sobre um
 * relógio de ticks de 1/60 s, e a soma em ponto flutuante chega ao fim um
 * fio abaixo dele: sem a folga, o PING de 15 s varria uma sexta vez no
 * último tick (achado no teste da sala).
 */
const PULSE_END_SLACK_S = 1e-6

function isSweepDue(pulse: Readonly<RadarPulse>, nowS: number): boolean {
  return nowS >= pulse.nextSweepAtS && pulse.endsAtS - pulse.nextSweepAtS > PULSE_END_SLACK_S
}

function sweepPulse(
  state: RadarState,
  ownerId: string,
  pulse: RadarPulse,
  nowS: number,
  fighters: readonly RadarFighterView[],
  into: RadarSweep[],
): void {
  // o intervalo conta do horário marcado, não de agora: o tick que atrasa não
  // empurra as varreduras seguintes.
  pulse.nextSweepAtS += pulse.sweepEveryS
  if (isRadarJammedFor(state, ownerId, nowS)) return
  into.push({ ownerId, blips: radarBlipsFor(ownerId, fighters), pulseLeftS: pulse.endsAtS - nowS })
}

/**
 * A partida nova: nenhum PING nem CONTRA-PING sobra da anterior.
 *
 * ```ts
 * resetRadarState(room.scorestreaks.radar)
 * ```
 */
export function resetRadarState(state: RadarState): void {
  state.pulses.clear()
  state.jams.clear()
}
