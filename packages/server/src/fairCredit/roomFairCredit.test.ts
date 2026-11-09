import {
  DEFAULT_FAIR_CREDIT_URL,
  type FairCreditMessage,
  type FairCreditRules,
  forgeIdToken,
  type MatchSummaryRow,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { FairCreditOutcome } from './fairCreditGateway.ts'
import { FakeFairCreditGateway } from './fairCreditGatewayFake.ts'
import { RoomFairCredit } from './roomFairCredit.ts'

const RULES: FairCreditRules = {
  productId: 7,
  pointsPerBrick: 500,
  mvpBonus: 2,
  creditCap: 10,
  creditUrl: DEFAULT_FAIR_CREDIT_URL,
}

const NOW_S = 1_000_000

/** A Feira que responde cada POST com o próximo resultado da lista. */
class ScriptedFairGateway extends FakeFairCreditGateway {
  readonly #outcomes: FairCreditOutcome[]

  constructor(outcomes: readonly FairCreditOutcome[]) {
    super()
    this.#outcomes = [...outcomes]
  }

  override credit(credential: string, productId: number, value: number) {
    this.outcome = this.#outcomes.shift() ?? 'credited'
    return super.credit(credential, productId, value)
  }
}

function tokenOf(sub: string, exp = NOW_S + 3600): string {
  return forgeIdToken({ sub, exp, name: sub })
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
  let nowS = NOW_S
  const desk = new RoomFairCredit({
    rules: RULES,
    gateway,
    send: (playerId, message) => sent.push({ playerId, message }),
    nowS: () => nowS,
  })
  const advance = (seconds: number) => {
    nowS += seconds
  }
  return { desk, gateway, sent, advance }
}

/** Os POSTs respondem numa promessa: o aviso sai no microtask seguinte. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('RoomFairCredit', () => {
  it('credita o MVP com o bônus e o resto pelos pontos', async () => {
    const { desk, gateway, sent } = deskWith()
    desk.remember('ana', tokenOf('conta-ana'))
    desk.remember('bia', tokenOf('conta-bia'))
    desk.settle([rowOf('ana', 1600), rowOf('bia', 1000)])
    await settled()
    expect(gateway.calls).toEqual([
      { credential: tokenOf('conta-ana'), productId: 7, value: 5 },
      { credential: tokenOf('conta-bia'), productId: 7, value: 2 },
    ])
    expect(sent).toEqual([
      { playerId: 'ana', message: { status: 'credited', bricks: 5 } },
      { playerId: 'bia', message: { status: 'credited', bricks: 2 } },
    ])
  })

  it('avisa quem não entrou com o Google do que teria ganhado, sem POST', () => {
    const { desk, gateway, sent } = deskWith()
    desk.settle([rowOf('ana', 1000)])
    expect(gateway.calls).toEqual([])
    expect(sent).toEqual([{ playerId: 'ana', message: { status: 'signed-out', bricks: 4 } }])
  })

  it('não faz POST de zero tijolinho', () => {
    const { desk, gateway, sent } = deskWith()
    desk.remember('ana', tokenOf('conta-ana'))
    desk.remember('bia', tokenOf('conta-bia'))
    desk.settle([rowOf('ana', 600), rowOf('bia', 100)])
    expect(gateway.calls).toHaveLength(1)
    expect(sent).toContainEqual({ playerId: 'bia', message: { status: 'none', bricks: 0 } })
  })

  it('ignora credencial que não é um token do Google', () => {
    const { desk, sent } = deskWith()
    desk.remember('ana', 42)
    desk.remember('ana', 'nao-e-jwt')
    desk.settle([rowOf('ana', 1000)])
    expect(sent[0]?.message.status).toBe('signed-out')
  })

  it('credita uma conta uma vez por partida, mesmo em duas abas', async () => {
    const { desk, gateway, sent } = deskWith()
    desk.remember('aba1', tokenOf('conta-ana'))
    desk.remember('aba2', tokenOf('conta-ana'))
    desk.settle([rowOf('aba1', 1000), rowOf('aba2', 1000)])
    await settled()
    expect(gateway.calls).toHaveLength(1)
    expect(sent).toContainEqual({ playerId: 'aba2', message: { status: 'duplicate', bricks: 2 } })
  })

  /** Regressão do review do PR #38: o POST que falhou marcava a conta como paga. */
  it('a outra aba da mesma conta credita quando o POST da primeira falha', async () => {
    const gateway = new ScriptedFairGateway(['failed', 'credited'])
    const { desk, sent } = deskWith(gateway)
    desk.remember('aba1', tokenOf('conta-ana'))
    desk.remember('aba2', tokenOf('conta-ana'))
    desk.settle([rowOf('aba1', 1000), rowOf('aba2', 1000)])
    await settled()
    expect(gateway.calls).toHaveLength(2)
    expect(sent).toEqual([
      { playerId: 'aba1', message: { status: 'failed', bricks: 4 } },
      { playerId: 'aba2', message: { status: 'credited', bricks: 2 } },
    ])
  })

  /** Regressão do review do PR #38: o token forjado com o `sub` da vítima negava o crédito dela. */
  it('um token forjado com a conta de outro, recusado pela Feira, não bloqueia o dono', async () => {
    const gateway = new ScriptedFairGateway(['failed', 'credited'])
    const { desk, sent } = deskWith(gateway)
    desk.remember('intruso', tokenOf('conta-ana'))
    desk.remember('ana', tokenOf('conta-ana'))
    desk.settle([rowOf('intruso', 2000), rowOf('ana', 1000)])
    await settled()
    expect(sent.at(-1)).toEqual({ playerId: 'ana', message: { status: 'credited', bricks: 2 } })
  })

  it('volta a creditar a mesma conta na partida seguinte', () => {
    const { desk, gateway } = deskWith()
    desk.remember('ana', tokenOf('conta-ana'))
    desk.settle([rowOf('ana', 1000)])
    desk.settle([rowOf('ana', 1000)])
    expect(gateway.calls).toHaveLength(2)
  })

  it('repassa a recusa da Feira', async () => {
    const gateway = new FakeFairCreditGateway()
    gateway.outcome = 'failed'
    const { desk, sent } = deskWith(gateway)
    desk.remember('ana', tokenOf('conta-ana'))
    desk.settle([rowOf('ana', 1000)])
    await settled()
    expect(sent).toEqual([{ playerId: 'ana', message: { status: 'failed', bricks: 4 } }])
  })

  describe('token vencido', () => {
    it('guarda o crédito e paga quando o login renovado chega', async () => {
      const { desk, gateway, sent, advance } = deskWith()
      desk.remember('ana', tokenOf('conta-ana', NOW_S + 10))
      desk.settle([rowOf('ana', 1000)])
      expect(gateway.calls).toEqual([])
      expect(sent).toEqual([{ playerId: 'ana', message: { status: 'expired', bricks: 4 } }])
      advance(60)
      desk.remember('ana', tokenOf('conta-ana', NOW_S + 3600))
      await settled()
      expect(gateway.calls).toEqual([
        { credential: tokenOf('conta-ana', NOW_S + 3600), productId: 7, value: 4 },
      ])
      expect(sent.at(-1)).toEqual({ playerId: 'ana', message: { status: 'credited', bricks: 4 } })
    })

    it('perde o guardado quando a partida seguinte acaba', () => {
      const { desk, gateway } = deskWith()
      desk.remember('ana', tokenOf('conta-ana', NOW_S))
      desk.settle([rowOf('ana', 1000)])
      desk.settle([rowOf('bia', 0), rowOf('ana', 0)])
      desk.remember('ana', tokenOf('conta-ana'))
      expect(gateway.calls).toEqual([])
    })

    it('perde o guardado quando o jogador sai', () => {
      const { desk, gateway } = deskWith()
      desk.remember('ana', tokenOf('conta-ana', NOW_S))
      desk.settle([rowOf('ana', 1000)])
      desk.forget('ana')
      desk.remember('ana', tokenOf('conta-ana'))
      expect(gateway.calls).toEqual([])
    })
  })

  it('esquece o login de quem saiu', () => {
    const { desk, sent } = deskWith()
    desk.remember('ana', tokenOf('conta-ana'))
    desk.forget('ana')
    desk.settle([rowOf('ana', 1000)])
    expect(sent[0]?.message.status).toBe('signed-out')
  })

  it('login sem crédito guardado só fica anotado', () => {
    const { desk, gateway } = deskWith()
    desk.remember('ana', tokenOf('conta-ana'))
    expect(gateway.calls).toEqual([])
  })
})
