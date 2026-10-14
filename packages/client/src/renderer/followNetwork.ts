import type { Camera } from '@babylonjs/core/Cameras/camera'
import type { Engine } from '@babylonjs/core/Engines/engine'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import { eyeOf, type StaticBox } from '@shobu/core'
import type { VoiceStage } from '../audio/spatialVoice.ts'
import {
  type ArenaSession,
  type ArenaSessionOptions,
  createArenaSession,
} from '../controller/arenaSession.ts'
import type { LocalCharacter } from '../controller/localCharacter.ts'
import {
  createPredictionHistory,
  type PredictionHistory,
  restartPredictionOnNewLife,
} from '../controller/predictionHistory.ts'
import { isPerfMode } from '../instrumentation/perfMode.ts'
import { createWireInput, encodeTickInput } from '../net/encodeTickInput.ts'
import { createNetStats, type NetStats } from '../net/netStats.ts'
import type { NetworkPort } from '../net/networkPort.ts'
import type { ArenaRendererOptions } from './arenaRenderer.ts'

/** O que a sessão recebe da cena: o personagem, a colisão, os inputs e os spawns no pé. */
export interface RoomSessionParts {
  readonly character: LocalCharacter
  readonly boxes: readonly StaticBox[]
  readonly movementInput: ArenaSessionOptions['movementInput']
  readonly weaponInput: ArenaSessionOptions['weaponInput']
  readonly respawnFeetM: ArenaSessionOptions['respawnFeetM']
}

export interface RoomSession {
  readonly session: ArenaSession
  /** Registra o que roda depois do `advance`: a reconciliação e a voz. */
  attachAfterAdvance(camera: Camera): void
}

/**
 * A sessão da arena, ligada à sala quando há uma (`options.network`): o input
 * de cada tick sai para o servidor, e o que a sala mudou entra antes do
 * `advance`. Chamar **antes** de `attachLocalCharacter`, que registra o
 * `advance`, e `attachAfterAdvance` depois dele.
 *
 * ```ts
 * const room = createRoomSession(scene, engine, options, { character, boxes, ... })
 * attachLocalCharacter(engine, scene, camera, options, { session: room.session, ... })
 * room.attachAfterAdvance(camera)
 * ```
 */
export function createRoomSession(
  scene: Scene,
  engine: Engine,
  options: ArenaRendererOptions,
  parts: RoomSessionParts,
): RoomSession {
  const { network, voice } = options
  const history = createPredictionHistory(options.config, parts.boxes)
  const stats = isPerfMode(window.location.search) ? createNetStats(STATS_WINDOW_MS) : undefined
  const session = createArenaSession({
    ...parts,
    config: options.config,
    navGraph: options.arena.navGraph(),
    playArea: options.arena.playArea,
    ...(network && { onTick: sendTickInput(network, history, parts.character, stats) }),
  })
  const wiring = network && { network, session, character: parts.character, history, stats }
  if (wiring) followRoomBeforeAdvance(scene, engine, wiring)
  return {
    session,
    attachAfterAdvance: (camera) => {
      if (wiring) reconcileAfterAdvance(scene, wiring)
      if (voice) placeRoomVoices(scene, camera, session, voice)
    },
  }
}

/** O que a cena liga à sala: a rede, a sessão, o personagem local e a predição. */
export interface NetworkWiring {
  readonly network: NetworkPort
  readonly session: ArenaSession
  readonly character: LocalCharacter
  readonly history: PredictionHistory
  /** A medição da rede, só em `?perf=1`. */
  readonly stats: NetStats | undefined
}

/** A janela do resumo da rede no console, em `?perf=1`. */
const STATS_WINDOW_MS = 2000

/**
 * O input que a predição acabou de usar, no formato de fio, para a sala, e
 * guardado no histórico com o estado que produziu: é contra ele que a
 * confirmação do servidor é comparada. Sem sala, não sai nada.
 *
 * ```ts
 * createArenaSession({ ..., onTick: sendTickInput(network, history, character) })
 * ```
 */
function sendTickInput(
  network: NetworkPort,
  history: PredictionHistory,
  character: LocalCharacter,
  stats: NetStats | undefined,
): NonNullable<ArenaSessionOptions['onTick']> {
  const wire = createWireInput()
  return (movement, weapon, aimM) => {
    const seq = network.sendTickInput(encodeTickInput(movement, weapon, aimM, wire))
    if (seq === undefined) return
    history.record(seq, movement, character.current)
    stats?.sent(seq)
  }
}

/**
 * Antes do `advance` do quadro: o que a sala mudou (spawn, outros jogadores,
 * mortes), e a predição zerada numa sala nova ou na volta da morte. Roda com a
 * arena parada no menu também: a sala não para. Registrar **antes** de
 * `attachLocalCharacter`, que registra o `advance`.
 */
function followRoomBeforeAdvance(scene: Scene, engine: Engine, wiring: NetworkWiring): void {
  const restartPrediction = restartPredictionOnNewLife(wiring.history)
  scene.onBeforeRenderObservable.add(() => {
    const { session, network } = wiring
    session.followRoom(network, performance.now(), engine.getDeltaTime() / 1000)
    restartPrediction(network.ownId, session.local.alive)
  })
}

/**
 * Depois do `advance`: a reconciliação com a confirmação do servidor. Morto,
 * o corpo está parado onde caiu, e a confirmação de antes da morte não vale.
 */
function reconcileAfterAdvance(scene: Scene, wiring: NetworkWiring): void {
  scene.onBeforeRenderObservable.add(() => {
    const confirmation = wiring.network.confirmation()
    reportStats(wiring, confirmation?.ackSeq)
    if (!confirmation || !wiring.session.local.alive) return
    const { ackSeq, own } = confirmation
    const outcome = wiring.history.reconcile(ackSeq, own, wiring.character)
    wiring.stats?.outcome(outcome)
    // a correção é o sinal de que predição e servidor discordaram; no caso
    // normal ela não acontece, então o log é a métrica, não ruído.
    if (outcome === 'corrected') {
      console.info(JSON.stringify({ event: 'prediction.corrected', ackSeq }))
    }
  })
}

function reportStats(wiring: NetworkWiring, ackSeq: number | undefined): void {
  const summary = wiring.stats?.frame(performance.now(), ackSeq, wiring.network.latencyMs())
  if (summary) console.info(JSON.stringify(summary))
}

/**
 * A voz por proximidade: quem ouve está na câmera, olhando para onde ela olha,
 * e a voz de cada jogador da sala sai do olho do corpo dele.
 */
function placeRoomVoices(
  scene: Scene,
  camera: Camera,
  session: ArenaSession,
  voice: VoiceStage,
): void {
  const forward = new Vector3()
  const mouth = { x: 0, y: 0, z: 0 }
  const speak = (
    playerId: string,
    fighter: Parameters<Parameters<ArenaSession['forEachRoomPlayer']>[0]>[1],
  ): void => voice.placeSpeaker(playerId, eyeOf(fighter.body, mouth))
  scene.onBeforeRenderObservable.add(() => {
    camera.getDirectionToRef(Vector3.Forward(), forward)
    voice.hearFrom(camera.globalPosition, forward)
    session.forEachRoomPlayer(speak)
  })
}
