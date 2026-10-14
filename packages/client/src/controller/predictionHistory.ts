import {
  type CharacterState,
  copyCharacterState,
  createCharacterState,
  dequantizePositionM,
  type GameplayConfig,
  IDLE_INPUT,
  type MovementInput,
  quantizePositionM,
  type StaticBox,
  stepCharacter,
} from '@shobu/core'
import type { LocalCharacter } from './localCharacter.ts'
import type { MutableMovementInput } from './wishDirection.ts'

/** A posição do próprio jogador que o servidor mandou, em milímetros (`wireFormat`). */
export interface OwnSnapshot {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * O que a reconciliação fez: confirmou a predição, corrigiu, ignorou uma
 * confirmação antiga, ou não achou mais o input confirmado no histórico.
 */
export type ReconcileOutcome = 'matched' | 'corrected' | 'stale' | 'unknown'

export interface PredictionHistory {
  /** Guarda o input que acabou de ser enviado como `seq` e o estado que ele produziu. */
  record(seq: number, input: Readonly<MovementInput>, state: Readonly<CharacterState>): void
  /**
   * Compara a predição no input `ackSeq` com a posição que o servidor mandou.
   * Se diferem, adota a do servidor e reaplica os inputs ainda não confirmados.
   */
  reconcile(ackSeq: number, own: OwnSnapshot, character: LocalCharacter): ReconcileOutcome
}

/**
 * Quantos inputs o histórico lembra: 1 s a 64 Hz. Cobre com folga a ida e volta
 * de um input mais o balde de crédito do servidor (docs/rede).
 */
const HISTORY_CAPACITY = 64

interface HistoryEntry {
  seq: number
  readonly input: MutableMovementInput
  readonly state: CharacterState
}

/**
 * A reconciliação do jogador local. O servidor avança cada jogador pelos
 * inputs dele (`stepRoom`), então aplicar os mesmos N inputs dá o mesmo estado
 * nos dois lados: o caso normal é `matched`, sem mexer em nada. A correção só
 * acontece quando o servidor decide diferente, e ela corrige a **posição**; o
 * resto do estado (velocidade, pulos, slide) é o da predição, que é o mesmo
 * código do servidor.
 *
 * Tudo pré-alocado: `record` roda a cada tick.
 *
 * ```ts
 * const history = createPredictionHistory(config, boxes)
 * history.record(seq, movementInput, character.current)
 * history.reconcile(link.lastProcessed(), own, character)
 * ```
 */
export function createPredictionHistory(
  config: GameplayConfig,
  boxes: readonly StaticBox[],
): PredictionHistory {
  const entries = createEntries(config)
  const origin = { x: 0, y: 0, z: 0 }
  const replay = {
    current: createCharacterState(origin, config),
    previous: createCharacterState(origin, config),
  }
  const cursor = { latestSeq: 0, lastAck: 0 }
  const entryAt = (seq: number): HistoryEntry | undefined => {
    const entry = entries[seq % HISTORY_CAPACITY]
    return entry?.seq === seq ? entry : undefined
  }
  const context = { entryAt, cursor, replay, config, boxes }
  return {
    record: (seq, input, state) => recordEntry(entries, cursor, seq, input, state),
    reconcile: (ackSeq, own, character) => reconcileAt(context, ackSeq, own, character),
  }
}

function createEntries(config: GameplayConfig): readonly HistoryEntry[] {
  return Array.from({ length: HISTORY_CAPACITY }, () => ({
    seq: -1,
    input: { ...IDLE_INPUT },
    state: createCharacterState({ x: 0, y: 0, z: 0 }, config),
  }))
}

function reconcileAt(
  context: ReplayContext,
  ackSeq: number,
  own: OwnSnapshot,
  character: LocalCharacter,
): ReconcileOutcome {
  if (ackSeq <= context.cursor.lastAck) return 'stale'
  context.cursor.lastAck = ackSeq
  const confirmed = context.entryAt(ackSeq)
  if (!confirmed) return 'unknown'
  if (agrees(confirmed.state, own)) return 'matched'
  replayFrom(confirmed, own, context)
  character.adopt(context.replay.current, context.replay.previous)
  return 'corrected'
}

function recordEntry(
  entries: readonly HistoryEntry[],
  cursor: { latestSeq: number },
  seq: number,
  input: Readonly<MovementInput>,
  state: Readonly<CharacterState>,
): void {
  const entry = Number.isInteger(seq) && seq >= 1 ? entries[seq % HISTORY_CAPACITY] : undefined
  if (!entry) throw new RangeError(`record recebeu seq ${seq}; esperado inteiro >= 1`)
  entry.seq = seq
  Object.assign(entry.input, input)
  copyCharacterState(state, entry.state)
  cursor.latestSeq = Math.max(cursor.latestSeq, seq)
}

/** Compara na resolução do fio: a predição arredondada como o servidor arredonda. */
function agrees(predicted: Readonly<CharacterState>, own: OwnSnapshot): boolean {
  return (
    quantizePositionM(predicted.position.x) === own.x &&
    quantizePositionM(predicted.position.y) === own.y &&
    quantizePositionM(predicted.position.z) === own.z
  )
}

interface ReplayContext {
  readonly entryAt: (seq: number) => HistoryEntry | undefined
  readonly cursor: { latestSeq: number; lastAck: number }
  readonly replay: { readonly current: CharacterState; readonly previous: CharacterState }
  readonly config: GameplayConfig
  readonly boxes: readonly StaticBox[]
}

/** Parte do estado confirmado com a posição do servidor e reaplica o que veio depois. */
function replayFrom(confirmed: HistoryEntry, own: OwnSnapshot, context: ReplayContext): void {
  const { replay, config, boxes } = context
  copyCharacterState(confirmed.state, replay.current)
  replay.current.position.x = dequantizePositionM(own.x)
  replay.current.position.y = dequantizePositionM(own.y)
  replay.current.position.z = dequantizePositionM(own.z)
  copyCharacterState(replay.current, confirmed.state)
  copyCharacterState(replay.current, replay.previous)
  const dtS = 1 / config.simulation.tickHz
  for (let seq = confirmed.seq + 1; seq <= context.cursor.latestSeq; seq += 1) {
    const entry = context.entryAt(seq)
    if (!entry) break
    copyCharacterState(replay.current, replay.previous)
    stepCharacter(replay.current, entry.input, boxes, config, dtS)
    copyCharacterState(replay.current, entry.state)
  }
}
