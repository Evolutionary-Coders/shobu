import { describe, expect, it } from 'vitest'
import { FakeGameLink } from '../net/gameLinkFake.ts'
import { createFairCreditRelay } from './fairCreditRelay.ts'

describe('createFairCreditRelay', () => {
  it('manda o ID à sala já conectada', () => {
    const relay = createFairCreditRelay()
    const link = new FakeGameLink()
    relay.attach(link)
    relay.chooseUser(11)
    expect(link.fairUsers).toEqual([11])
  })

  it('guarda o ID para a sala que chegar depois, e reenvia o último a cada sala', () => {
    const relay = createFairCreditRelay()
    relay.chooseUser(11)
    relay.chooseUser(12)
    const first = new FakeGameLink()
    relay.attach(first)
    const second = new FakeGameLink()
    relay.attach(second)
    expect(first.fairUsers).toEqual([12])
    expect(second.fairUsers).toEqual([12])
  })

  it('sem ID, não manda nada à sala nova', () => {
    const relay = createFairCreditRelay()
    relay.chooseUser(11)
    relay.chooseUser(null)
    const link = new FakeGameLink()
    relay.attach(link)
    expect(link.fairUsers).toEqual([])
  })

  it('apagar o ID avisa a sala atual', () => {
    const relay = createFairCreditRelay()
    const link = new FakeGameLink()
    relay.attach(link)
    relay.chooseUser(11)
    relay.chooseUser(null)
    expect(link.fairUsers).toEqual([11, null])
  })

  /** Regressão do review do PR #38: o login renovado ia para a sala que já tinha fechado. */
  it('a sala que fecha não recebe o ID trocado; a próxima recebe', () => {
    const relay = createFairCreditRelay()
    const closed = new FakeGameLink()
    relay.attach(closed)
    closed.close()
    relay.chooseUser(12)
    const next = new FakeGameLink()
    relay.attach(next)
    expect(closed.fairUsers).toEqual([])
    expect(next.fairUsers).toEqual([12])
  })

  it('o fechamento de uma sala antiga não solta a atual', () => {
    const relay = createFairCreditRelay()
    const old = new FakeGameLink()
    relay.attach(old)
    const current = new FakeGameLink()
    relay.attach(current)
    old.close()
    relay.chooseUser(13)
    expect(current.fairUsers).toEqual([13])
  })

  it('repassa o crédito só da sala atual', () => {
    const relay = createFairCreditRelay()
    const heard: unknown[] = []
    relay.onCredit((credit) => heard.push(credit))
    const old = new FakeGameLink()
    relay.attach(old)
    const current = new FakeGameLink()
    relay.attach(current)
    old.creditFair({ status: 'credited', bricks: 1 })
    current.creditFair({ status: 'credited', bricks: 3 })
    expect(heard).toEqual([{ status: 'credited', bricks: 3 }])
  })
})
