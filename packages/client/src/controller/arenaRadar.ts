import {
  applyScorestreakActivation,
  createRadarState,
  type GameplayConfig,
  type RadarBlip,
  type RadarConfig,
  type RadarState,
  type RadarSweep,
  type RadarSweepMessage,
  resetScorestreakEffects,
  stepRadarPulses,
} from '@shobu/core'
import { type ArenaParts, LOCAL_PLAYER_ID } from './arenaParts.ts'

/**
 * O radar da arena do lado do cliente (ADR 0035). Offline o cliente decide as
 * varreduras com a mesma `stepRadarPulses` da sala; online elas vêm da sala, e
 * o cliente só conta o PING próprio (a barra), a partir dos avisos de série
 * que todo mundo recebe.
 */

/** Um ponto no minimapa: de varredura do PING, ou do tiro de alguém. */
export interface MinimapBlip {
  readonly id: string
  readonly xM: number
  readonly yM: number
  readonly zM: number
  /** No relógio da sessão (`matchTimeS`): é dele que o ponto some. */
  readonly seenAtS: number
  readonly kind: 'sweep' | 'shot'
}

export interface ArenaRadar {
  readonly state: RadarState
  /** Os pontos vivos no minimapa, os mais velhos primeiro. */
  readonly blips: MinimapBlip[]
  /** Online: as varreduras que a sala mandou desde o último quadro andado. */
  readonly arrivedSweeps: RadarSweepMessage[]
  /** Rascunho de `stepRadarPulses`, offline. */
  readonly sweeps: RadarSweep[]
  /** Quantas varreduras do PING próprio já chegaram: a tela pulsa o anel a cada uma. */
  sweepCount: number
}

/**
 * O radar vazio, no boot da arena.
 *
 * ```ts
 * const parts = { ...createArenaRadar() }
 * ```
 */
export function createArenaRadar(): ArenaRadar {
  return {
    state: createRadarState(),
    blips: [],
    arrivedSweeps: [],
    sweeps: [],
    sweepCount: 0,
  }
}

/**
 * O fim do quadro andado: os acionamentos do quadro entram no radar e nos
 * efeitos (`applyScorestreakActivation`, a mesma da sala), as varreduras
 * viram pontos, cada tiro de outro combatente marca quem atirou, e
 * o ponto velho sai. Roda depois dos ticks, quando os avisos e os rastros do
 * quadro já estão todos anotados, e antes de o quadro seguinte os zerar.
 *
 * ```ts
 * stepArenaRadar(parts, session.matchTimeS, options.config)
 * ```
 */
export function stepArenaRadar(parts: ArenaParts, nowS: number, config: GameplayConfig): void {
  const { radar, scorestreakEffects } = parts
  for (const notice of parts.scorestreakNotices) {
    applyScorestreakActivation(scorestreakEffects, radar.state, notice, nowS, config)
  }
  if (parts.online) takeArrivedSweeps(radar, nowS)
  else sweepOffline(parts, nowS)
  revealShooters(parts, nowS)
  forgetOldBlips(radar.blips, nowS, config.radar)
}

/**
 * A varredura que a sala mandou, guardada até o quadro andar: é ele que tem o
 * relógio com que o ponto some.
 *
 * ```ts
 * feed.drainRadarSweeps((sweep) => holdRoomSweep(parts.radar, sweep))
 * ```
 */
export function holdRoomSweep(radar: ArenaRadar, sweep: RadarSweepMessage): void {
  radar.arrivedSweeps.push(sweep)
}

function takeArrivedSweeps(radar: ArenaRadar, nowS: number): void {
  for (const sweep of radar.arrivedSweeps) markSweep(radar, sweep.blips, nowS)
  radar.arrivedSweeps.length = 0
}

/** Offline o PING dos bots também varre, e cai no vazio: o cérebro deles não lê radar. */
function sweepOffline(parts: ArenaParts, nowS: number): void {
  const { radar } = parts
  radar.sweeps.length = 0
  stepRadarPulses(radar.state, nowS, parts.fighters, radar.sweeps)
  for (const sweep of radar.sweeps) {
    if (sweep.ownerId === LOCAL_PLAYER_ID) markSweep(radar, sweep.blips, nowS)
  }
}

/** A varredura nova troca a anterior inteira: o inimigo está onde a última o viu. */
function markSweep(radar: ArenaRadar, blips: readonly RadarBlip[], nowS: number): void {
  removeBlips(radar.blips, (blip) => blip.kind === 'sweep')
  for (const { id, xM, yM, zM } of blips) {
    radar.blips.push({ id, xM, yM, zM, seenAtS: nowS, kind: 'sweep' })
  }
  radar.sweepCount += 1
}

/**
 * Os rastros do quadro são os tiros dos outros — o dos bots offline, o de
 * cada vaga online —, nunca o do jogador. Cada um marca a boca do cano.
 */
function revealShooters(parts: ArenaParts, nowS: number): void {
  const { tracers, squad, radar } = parts
  for (let index = 0; index < tracers.count; index += 1) {
    const tracer = tracers.slots[index]
    const shooter = tracer && squad.bots[tracer.botIndex]
    if (!(tracer && shooter)) continue
    const id = shooter.id
    removeBlips(radar.blips, (blip) => blip.kind === 'shot' && blip.id === id)
    const { x, y, z } = tracer.fromM
    radar.blips.push({ id, xM: x, yM: y, zM: z, seenAtS: nowS, kind: 'shot' })
  }
}

function forgetOldBlips(blips: MinimapBlip[], nowS: number, config: RadarConfig): void {
  removeBlips(blips, (blip) => nowS - blip.seenAtS >= blipLifeS(blip, config))
}

/**
 * Quanto o ponto fica no minimapa: a varredura dura o desbotar, o tiro o
 * `shotRevealS`.
 *
 * ```ts
 * blipLifeS(blip, config.radar) // 2.5
 * ```
 */
export function blipLifeS(blip: Pick<MinimapBlip, 'kind'>, config: RadarConfig): number {
  return blip.kind === 'sweep' ? config.blipFadeS : config.shotRevealS
}

/** Tira no lugar, sem lista nova: a lista tem meia dúzia de pontos. */
function removeBlips(blips: MinimapBlip[], drop: (blip: MinimapBlip) => boolean): void {
  let kept = 0
  for (const blip of blips) {
    if (!drop(blip)) {
      blips[kept] = blip
      kept += 1
    }
  }
  blips.length = kept
}

/**
 * A partida nova, também online: o `matchTimeS` da sessão volta a zero em
 * todo recomeço (`arenaRestart.ts`), e um PING ou um efeito contado no
 * relógio velho mostraria a barra errada. Online a sala segue varrendo atrás do menu, e a
 * varredura seguinte volta a pôr os pontos.
 *
 * ```ts
 * restartArenaRadar(parts)
 * ```
 */
export function restartArenaRadar(parts: ArenaParts): void {
  const { radar } = parts
  resetScorestreakEffects(parts.scorestreakEffects, radar.state)
  radar.blips.length = 0
  radar.arrivedSweeps.length = 0
}
