import { readFileSync } from 'node:fs'
import {
  boxFromCenterSize,
  IDLE_INPUT,
  type MovementInput,
  parseGameplayConfig,
  quantizePositionM,
  type StaticBox,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createLocalCharacter, type LocalCharacter } from './localCharacter.ts'
import {
  createPredictionHistory,
  type OwnSnapshot,
  restartPredictionOnNewLife,
} from './predictionHistory.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const FLOOR: StaticBox = boxFromCenterSize([0, -0.5, 0], [64, 1, 64])
const BOXES = [FLOOR]
const FORWARD: MovementInput = { ...IDLE_INPUT, wishZ: -1 }

/** Anda N ticks gravando cada um no histórico, como o renderer faz a cada input enviado. */
function walk(
  character: LocalCharacter,
  history: ReturnType<typeof createPredictionHistory>,
  firstSeq: number,
  ticks: number,
): void {
  for (let index = 0; index < ticks; index += 1) {
    character.stepOnce(FORWARD)
    history.record(firstSeq + index, FORWARD, character.current)
  }
}

function snapshotOf(feetM: { x: number; y: number; z: number }): OwnSnapshot {
  return {
    x: quantizePositionM(feetM.x),
    y: quantizePositionM(feetM.y),
    z: quantizePositionM(feetM.z),
  }
}

function setup(): {
  character: LocalCharacter
  history: ReturnType<typeof createPredictionHistory>
} {
  const character = createLocalCharacter(config, { x: 0, y: 0, z: 0 }, BOXES)
  character.stepOnce(IDLE_INPUT)
  return { character, history: createPredictionHistory(config, BOXES) }
}

describe('createPredictionHistory', () => {
  /** O caso normal: servidor e cliente simularam os mesmos inputs e chegaram ao mesmo lugar. */
  it('não mexe no personagem quando o servidor confirma a predição', () => {
    const { character, history } = setup()
    walk(character, history, 1, 5)
    const predicted = { ...character.current.position }

    expect(history.reconcile(5, snapshotOf(predicted), character)).toBe('matched')
    expect(character.current.position).toEqual(predicted)
  })

  it('corrige para a posição do servidor e reaplica os inputs ainda não confirmados', () => {
    const { character, history } = setup()
    walk(character, history, 1, 3)
    const predictedAtThree = { ...character.current.position }
    walk(character, history, 4, 4)
    const predictedAtSeven = { ...character.current.position }
    const serverAtThree = snapshotOf({ ...predictedAtThree, x: predictedAtThree.x + 0.5 })

    expect(history.reconcile(3, serverAtThree, character)).toBe('corrected')

    expect(character.current.position.x).toBeCloseTo(predictedAtSeven.x + 0.5, 3)
    expect(character.current.position.z).toBeCloseTo(predictedAtSeven.z, 3)
  })

  it('ignora confirmação que não é mais nova que a última', () => {
    const { character, history } = setup()
    walk(character, history, 1, 3)
    const server = snapshotOf(character.current.position)
    history.reconcile(3, server, character)
    expect(history.reconcile(2, snapshotOf({ x: 9, y: 0, z: 9 }), character)).toBe('stale')
  })

  it('não corrige a partir de input que já saiu do histórico', () => {
    const { character, history } = setup()
    walk(character, history, 1, 100)
    expect(history.reconcile(2, snapshotOf({ x: 9, y: 0, z: 9 }), character)).toBe('unknown')
  })

  it('recusa seq que não é inteiro positivo, dizendo qual', () => {
    const { character, history } = setup()
    expect(() => history.record(0, FORWARD, character.current)).toThrow(/seq 0/)
    expect(() => history.record(1.5, FORWARD, character.current)).toThrow(/seq 1.5/)
  })

  /** Um input que nunca foi gravado interrompe a reaplicação ali, em vez de pular o buraco. */
  it('para a reaplicação no primeiro input que falta', () => {
    const { character, history } = setup()
    walk(character, history, 1, 2)
    character.stepOnce(FORWARD)
    walk(character, history, 4, 3)
    const server = snapshotOf({ x: 5, y: 0, z: 0 })

    expect(history.reconcile(1, server, character)).toBe('corrected')

    expect(character.current.position.x).toBeCloseTo(5, 3)
  })
})

describe('reset', () => {
  /** Regressão: a sala nova contava de 1, e cada confirmação dela era `stale`. */
  it('volta a aceitar confirmações a partir de 1', () => {
    const { character, history } = setup()
    walk(character, history, 100, 3)
    history.reconcile(102, snapshotOf(character.current.position), character)
    history.reset()
    walk(character, history, 1, 2)
    expect(history.reconcile(2, snapshotOf(character.current.position), character)).toBe('matched')
  })

  /** Regressão: a confirmação de um input de antes da morte punha no spawn o corpo do morto. */
  it('esquece os inputs gravados antes', () => {
    const { character, history } = setup()
    walk(character, history, 1, 3)
    history.reset()
    expect(history.reconcile(3, snapshotOf({ x: 9, y: 9, z: 9 }), character)).toBe('unknown')
  })
})

/** O histórico que só conta quantas vezes foi zerado. */
class CountingHistory {
  resets = 0
  readonly reset = (): void => {
    this.resets += 1
  }
}

describe('restartPredictionOnNewLife', () => {
  it('zera na primeira sala, numa sala nova e na volta da morte, e só nelas', () => {
    const history = new CountingHistory()
    const restart = restartPredictionOnNewLife(history)
    restart(undefined, true)
    expect(history.resets).toBe(0)
    restart('sala-a', true)
    restart('sala-a', true)
    expect(history.resets).toBe(1)
    restart('sala-a', false)
    restart('sala-a', false)
    restart('sala-a', true)
    expect(history.resets).toBe(2)
    // sem sala por um instante, e de volta à mesma: não é sala nova.
    restart(undefined, true)
    restart('sala-a', true)
    expect(history.resets).toBe(2)
    restart('sala-b', true)
    expect(history.resets).toBe(3)
  })
})
