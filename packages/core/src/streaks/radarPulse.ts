import type { RadarConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'

/**
 * O PING ou o SONAR que está varrendo: até quando dura, quando sai a próxima
 * varredura, e quanto o ponto de cada uma fica no minimapa. Os tempos são o
 * relógio da partida de quem chama, nunca o de parede (ADR 0003).
 */
export interface RadarPulse {
  readonly endsAtS: number
  readonly sweepEveryS: number
  readonly revealS: number
  nextSweepAtS: number
}

/**
 * O radar de uma partida (ADR 0035): os PINGs varrendo, por dono, e o
 * embaralhamento, por quem embaralha (o gancho do CONTRA-PING, ainda sem
 * efeito). O mesmo estado serve a sala do
 * servidor, que decide as varreduras, e o cliente, que só lê o embaralhamento
 * e o tempo que falta para pintar o hud.
 */
export interface RadarState {
  readonly pulses: Map<string, RadarPulse>
  /**
   * Os SONARs, por dono: a varredura única de cada um. Fora de `pulses` para
   * o SONAR não apagar o PING do mesmo dono, nem a barra dele.
   */
  readonly sonars: Map<string, RadarPulse>
  /**
   * Quem embaralha o radar dos outros → até quando. É o gancho do
   * CONTRA-PING, que ainda não tem efeito: nenhuma série escreve aqui hoje.
   */
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

/**
 * A varredura de um dono: os inimigos daquele instante, quanto falta de PING
 * (ou de SONAR) e quanto o ponto fica no minimapa.
 */
export interface RadarSweep {
  readonly ownerId: string
  readonly blips: readonly RadarBlip[]
  readonly pulseLeftS: number
  readonly revealS: number
}

/**
 * O radar vazio.
 *
 * ```ts
 * const radar = createRadarState()
 * ```
 */
export function createRadarState(): RadarState {
  return { pulses: new Map(), sonars: new Map(), jams: new Map() }
}

/**
 * O PING de `ownerId` começa a varrer já. Quem decide qual série chama isto é
 * `applyScorestreakActivation` (`scorestreakEffects.ts`). Acionar de novo o
 * PING que está rodando recomeça a contagem.
 *
 * ```ts
 * startPingPulse(radar, notice.playerId, matchTimeS, config.radar)
 * ```
 */
export function startPingPulse(
  state: RadarState,
  ownerId: string,
  nowS: number,
  config: RadarConfig,
): void {
  state.pulses.set(ownerId, {
    endsAtS: nowS + config.pingDurationS,
    sweepEveryS: config.pingSweepEveryS,
    revealS: config.blipFadeS,
    nextSweepAtS: nowS,
  })
}

/**
 * O SONAR de `ownerId`: uma varredura só, já, cujo ponto fica `sonarRevealS`
 * no minimapa. É o mesmo pulso do PING, com o intervalo do tamanho dele —
 * a segunda varredura cairia no fim, e o fim não varre.
 *
 * ```ts
 * startSonarSweep(radar, notice.playerId, matchTimeS, config.radar)
 * ```
 */
export function startSonarSweep(
  state: RadarState,
  ownerId: string,
  nowS: number,
  config: RadarConfig,
): void {
  state.sonars.set(ownerId, {
    endsAtS: nowS + config.sonarRevealS,
    sweepEveryS: config.sonarRevealS,
    revealS: config.sonarRevealS,
    nextSweepAtS: nowS,
  })
}

/**
 * Se o radar de `viewerId` está embaralhado agora: o embaralhamento de outra
 * pessoa ainda rodando. O de quem embaralha não cega o próprio radar.
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
 * O passo do radar: cada PING e SONAR com varredura vencida varre e marca a
 * próxima, e o que acabou sai. O dono embaralhado não recebe a varredura —
 * ela se perde, e a próxima sai no horário dela. As varreduras vão para `into`.
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
  stepPulseMap(state, state.pulses, nowS, fighters, into)
  stepPulseMap(state, state.sonars, nowS, fighters, into)
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

function stepPulseMap(
  state: RadarState,
  pulses: Map<string, RadarPulse>,
  nowS: number,
  fighters: readonly RadarFighterView[],
  into: RadarSweep[],
): void {
  for (const [ownerId, pulse] of pulses) {
    if (isSweepDue(pulse, nowS)) sweepPulse(state, ownerId, pulse, nowS, fighters, into)
    if (nowS >= pulse.endsAtS) pulses.delete(ownerId)
  }
}

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
  const blips = radarBlipsFor(ownerId, fighters)
  into.push({ ownerId, blips, pulseLeftS: pulse.endsAtS - nowS, revealS: pulse.revealS })
}

/**
 * A partida nova: nenhum PING, SONAR nem embaralhamento sobra da anterior.
 *
 * ```ts
 * resetRadarState(room.scorestreaks.radar)
 * ```
 */
export function resetRadarState(state: RadarState): void {
  state.pulses.clear()
  state.sonars.clear()
  state.jams.clear()
}
