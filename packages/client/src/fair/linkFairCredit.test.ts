import { type FairCreditMessage, forgeIdToken } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { FairCreditRelay } from './fairCreditRelay.ts'
import type { GoogleSignIn } from './googleSignIn.ts'
import { linkFairCredit } from './linkFairCredit.ts'

/** O Google em memória: o teste entrega o token e conta os pedidos de login. */
class FakeGoogleSignIn implements GoogleSignIn {
  refreshes = 0
  renderedIn: unknown
  #listener: ((credential: string) => void) | undefined

  renderButton(parent: HTMLElement): void {
    this.renderedIn = parent
  }

  refresh(): void {
    this.refreshes += 1
  }

  onCredential(listener: (credential: string) => void): void {
    this.#listener = listener
  }

  deliver(credential: string): void {
    this.#listener?.(credential)
  }
}

/** O relay em memória: anota o token e deixa o teste avisar o crédito. */
class FakeFairCreditRelay implements FairCreditRelay {
  readonly credentials: string[] = []
  #listener: ((credit: FairCreditMessage) => void) | undefined

  attach(): void {}

  chooseCredential(credential: string): void {
    this.credentials.push(credential)
  }

  onCredit(listener: (credit: FairCreditMessage) => void): void {
    this.#listener = listener
  }

  credit(credit: FairCreditMessage): void {
    this.#listener?.(credit)
  }
}

class FakeFairBadge {
  readonly buttonSlot = {} as HTMLElement
  account: string | undefined
  readonly credits: string[] = []

  setAccount(name: string): void {
    this.account = name
  }

  showCredit(text: string): void {
    this.credits.push(text)
  }
}

function linked() {
  const relay = new FakeFairCreditRelay()
  const signIn = new FakeGoogleSignIn()
  const badge = new FakeFairBadge()
  linkFairCredit(relay, signIn, badge)
  return { relay, signIn, badge }
}

describe('linkFairCredit', () => {
  it('desenha o botão e já tenta o login automático', () => {
    const { signIn, badge } = linked()
    expect(signIn.renderedIn).toBe(badge.buttonSlot)
    expect(signIn.refreshes).toBe(1)
  })

  it('leva o token à sala e o nome ao selo', () => {
    const { relay, signIn, badge } = linked()
    const token = forgeIdToken({ sub: 'c1', exp: 1, name: 'Ana' })
    signIn.deliver(token)
    expect(relay.credentials).toEqual([token])
    expect(badge.account).toBe('Ana')
  })

  it('token sem a forma do Google ainda vai à sala, sem nome', () => {
    const { relay, signIn, badge } = linked()
    signIn.deliver('estranho')
    expect(relay.credentials).toEqual(['estranho'])
    expect(badge.account).toBe('')
  })

  it('mostra o crédito no selo', () => {
    const { relay, badge } = linked()
    relay.credit({ status: 'credited', bricks: 2 })
    relay.credit({ status: 'none', bricks: 0 })
    expect(badge.credits).toEqual(['+2 TIJOLINHOS NA FEIRA'])
  })

  it('pede login novo quando a sala diz que o token venceu', () => {
    const { relay, signIn } = linked()
    relay.credit({ status: 'expired', bricks: 2 })
    expect(signIn.refreshes).toBe(2)
  })
})
