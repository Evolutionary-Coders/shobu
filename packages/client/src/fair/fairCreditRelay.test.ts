import { describe, expect, it } from 'vitest'
import { FakeGameLink } from '../net/gameLinkFake.ts'
import { createFairCreditRelay } from './fairCreditRelay.ts'

describe('createFairCreditRelay', () => {
  it('manda o token à sala já conectada', () => {
    const relay = createFairCreditRelay()
    const link = new FakeGameLink()
    relay.attach(link)
    relay.chooseCredential('t1')
    expect(link.fairCredentials).toEqual(['t1'])
  })

  it('guarda o token para a sala que chegar depois, e reenvia o último a cada sala', () => {
    const relay = createFairCreditRelay()
    relay.chooseCredential('t1')
    relay.chooseCredential('t2')
    const first = new FakeGameLink()
    relay.attach(first)
    const second = new FakeGameLink()
    relay.attach(second)
    expect(first.fairCredentials).toEqual(['t2'])
    expect(second.fairCredentials).toEqual(['t2'])
  })

  it('sem login, não manda nada', () => {
    const link = new FakeGameLink()
    createFairCreditRelay().attach(link)
    expect(link.fairCredentials).toEqual([])
  })

  /** Regressão do review do PR #38: o token renovado ia para a sala que já tinha fechado. */
  it('a sala que fecha não recebe o token renovado; a próxima recebe', () => {
    const relay = createFairCreditRelay()
    const closed = new FakeGameLink()
    relay.attach(closed)
    closed.close()
    relay.chooseCredential('t2')
    const next = new FakeGameLink()
    relay.attach(next)
    expect(closed.fairCredentials).toEqual([])
    expect(next.fairCredentials).toEqual(['t2'])
  })

  it('o fechamento de uma sala antiga não solta a atual', () => {
    const relay = createFairCreditRelay()
    const old = new FakeGameLink()
    relay.attach(old)
    const current = new FakeGameLink()
    relay.attach(current)
    old.close()
    relay.chooseCredential('t3')
    expect(current.fairCredentials).toEqual(['t3'])
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
