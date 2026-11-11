import {
  DEFAULT_FAIR_CREDIT_URL,
  type FairCreditMessage,
  type FairCreditRules,
  type MatchSummaryRow,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { FairCreditOutcome } from './fairCreditGateway.ts'
import { FakeFairCreditGateway } from './fairCreditGatewayFake.ts'
import { RoomFairCredit } from './roomFairCredit.ts'

const RULES: FairCreditRules = {
  serverToken: 'segredo',
  pointsPerBrick: 500,
  mvpBonus: 2,
  creditCap: 10,
  creditUrl: DEFAULT_FAIR_CREDIT_URL,
}

/** A Feira que responde cada POST com o próximo resultado da lista. */
class ScriptedFairGateway extends FakeFairCreditGateway {
  readonly #outcomes: FairCreditOutcome[]

  constructor(outcomes: readonly FairCreditOutcome[]) {
    super()
    this.#outcomes = [...outcomes]
  }

  override credit(userId: number, bricks: number) {
    this.outcome = this.#outcomes.shift() ?? 'credited'
    return super.credit(userId, bricks)
  }
}

function rowOf(playerId: string, points: number): MatchSummaryRow {
  return {
    playerId,
    points,
    kills: 0,
    deaths: 0,
    kd: 0,
    accuracy: 0,
    bestStreak: 0,
    medals: 0,
  }
}

function deskWith(gateway = new FakeFairCreditGateway()) {
  const sent: { playerId: string; message: FairCreditMessage }[] = []
  const desk = new RoomFairCredit({
    rules: RULES,
    gateway,
    send: (playerId, message) => sent.push({ playerId, message }),
  })
  return { desk, gateway, sent }
}

/** Os POSTs respondem numa promessa: o aviso sai no microtask seguinte. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('RoomFairCredit', () => {
  it('credita o MVP com o bônus e o resto pelos pontos', async () => {
    const { desk, gateway, sent } = deskWith()
    desk.remember('ana', 11)
    desk.remember('bia', 12)
    desk.settle([rowOf('ana', 1600), rowOf('bia', 1000)])
    await settled()
    expect(gateway.calls).toEqual([
      { userId: 11, bricks: 5 },
      { userId: 12, bricks: 2 },
    ])
    expect(sent).toEqual([
      { playerId: 'ana', message: { status: 'credited', bricks: 5 } },
      { playerId: 'bia', message: { status: 'credited', bricks: 2 } },
    ])
  })

  it('avisa quem jogou sem ID do que teria ganhado, sem POST', () => {
    const { desk, gateway, sent } = deskWith()
    desk.settle([rowOf('ana', 1000)])
    expect(gateway.calls).toEqual([])
    expect(sent).toEqual([{ playerId: 'ana', message: { status: 'anonymous', bricks: 4 } }])
  })

  it('não faz POST de zero tijolinho', () => {
    const { desk, gateway, sent } = deskWith()
    desk.remember('ana', 11)
    desk.remember('bia', 12)
    desk.settle([rowOf('ana', 600), rowOf('bia', 100)])
    expect(gateway.calls).toHaveLength(1)
    expect(sent).toContainEqual({ playerId: 'bia', message: { status: 'none', bricks: 0 } })
  })

  it('aceita o ID que chega como texto de dígitos', () => {
    const { desk, gateway } = deskWith()
    desk.remember('ana', '11')
    desk.settle([rowOf('ana', 1000)])
    expect(gateway.calls).toEqual([{ userId: 11, bricks: 4 }])
  })

  it('o que não tem forma de ID apaga o ID anterior', () => {
    const { desk, gateway, sent } = deskWith()
    desk.remember('ana', 11)
    desk.remember('ana', null)
    desk.settle([rowOf('ana', 1000)])
    expect(gateway.calls).toEqual([])
    expect(sent[0]?.message.status).toBe('anonymous')
  })

  it('a troca de ID no menu vale para o crédito', () => {
    const { desk, gateway } = deskWith()
    desk.remember('ana', 11)
    desk.remember('ana', 99)
    desk.settle([rowOf('ana', 1000)])
    expect(gateway.calls).toEqual([{ userId: 99, bricks: 4 }])
  })

  it('credita um ID uma vez por partida, mesmo em duas abas', async () => {
    const { desk, gateway, sent } = deskWith()
    desk.remember('aba1', 11)
    desk.remember('aba2', 11)
    desk.settle([rowOf('aba1', 1000), rowOf('aba2', 1000)])
    await settled()
    expect(gateway.calls).toHaveLength(1)
    expect(sent).toContainEqual({ playerId: 'aba2', message: { status: 'duplicate', bricks: 2 } })
  })

  /** Regressão do review do PR #38: o POST que falhou marcava a conta como paga. */
  it('a outra aba do mesmo ID credita quando o POST da primeira falha', async () => {
    const gateway = new ScriptedFairGateway(['failed', 'credited'])
    const { desk, sent } = deskWith(gateway)
    desk.remember('aba1', 11)
    desk.remember('aba2', 11)
    desk.settle([rowOf('aba1', 1000), rowOf('aba2', 1000)])
    await settled()
    expect(gateway.calls).toHaveLength(2)
    expect(sent).toEqual([
      { playerId: 'aba1', message: { status: 'failed', bricks: 4 } },
      { playerId: 'aba2', message: { status: 'credited', bricks: 2 } },
    ])
  })

  it('a terceira aba do mesmo ID também é duplicada', async () => {
    const { desk, gateway, sent } = deskWith()
    for (const tab of ['aba1', 'aba2', 'aba3']) desk.remember(tab, 11)
    desk.settle([rowOf('aba1', 1000), rowOf('aba2', 1000), rowOf('aba3', 1000)])
    await settled()
    expect(gateway.calls).toHaveLength(1)
    expect(sent.at(-1)).toEqual({ playerId: 'aba3', message: { status: 'duplicate', bricks: 2 } })
  })

  it('repassa o ID que a Feira não conhece', async () => {
    const gateway = new FakeFairCreditGateway()
    gateway.outcome = 'unknown-user'
    const { desk, sent } = deskWith(gateway)
    desk.remember('ana', 404)
    desk.settle([rowOf('ana', 1000)])
    await settled()
    expect(sent).toEqual([{ playerId: 'ana', message: { status: 'unknown-user', bricks: 4 } }])
  })

  it('volta a creditar o mesmo ID na partida seguinte', () => {
    const { desk, gateway } = deskWith()
    desk.remember('ana', 11)
    desk.settle([rowOf('ana', 1000)])
    desk.settle([rowOf('ana', 1000)])
    expect(gateway.calls).toHaveLength(2)
  })

  it('esquece o ID de quem saiu', () => {
    const { desk, sent } = deskWith()
    desk.remember('ana', 11)
    desk.forget('ana')
    desk.settle([rowOf('ana', 1000)])
    expect(sent[0]?.message.status).toBe('anonymous')
  })
})
