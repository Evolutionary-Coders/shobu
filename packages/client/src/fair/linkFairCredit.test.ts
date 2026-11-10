import type { FairCreditMessage } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createMemorySettingsStorage } from '../settings/jsonStore.ts'
import type { FairCreditRelay } from './fairCreditRelay.ts'
import type { FairUserModal } from './fairUserModal.ts'
import { createFairUserStore } from './fairUserStore.ts'
import { linkFairCredit } from './linkFairCredit.ts'

/** O relay em memória: anota o ID e deixa o teste avisar o crédito. */
class FakeFairCreditRelay implements FairCreditRelay {
  readonly users: (number | null)[] = []
  #listener: ((credit: FairCreditMessage) => void) | undefined

  attach(): void {}

  chooseUser(userId: number | null): void {
    this.users.push(userId)
  }

  onCredit(listener: (credit: FairCreditMessage) => void): void {
    this.#listener = listener
  }

  credit(credit: FairCreditMessage): void {
    this.#listener?.(credit)
  }
}

/** O modal em memória: anota cada abertura e deixa o teste escolher. */
class FakeFairUserModal implements FairUserModal {
  readonly opened: (number | null)[] = []
  #listener: ((userId: number | null) => void) | undefined

  open(current: number | null): void {
    this.opened.push(current)
  }

  onChoose(listener: (userId: number | null) => void): void {
    this.#listener = listener
  }

  choose(userId: number | null): void {
    this.#listener?.(userId)
  }
}

class FakeFairBadge {
  user: number | null | undefined
  readonly credits: string[] = []
  #changeListener: (() => void) | undefined

  setUser(userId: number | null): void {
    this.user = userId
  }

  showCredit(text: string): void {
    this.credits.push(text)
  }

  onChangeRequest(listener: () => void): void {
    this.#changeListener = listener
  }

  requestChange(): void {
    this.#changeListener?.()
  }
}

function linked(saved?: number | null, askOnOpen = false) {
  const relay = new FakeFairCreditRelay()
  const store = createFairUserStore(createMemorySettingsStorage())
  if (saved !== undefined) store.write(saved)
  const modal = new FakeFairUserModal()
  const badge = new FakeFairBadge()
  linkFairCredit({ relay, store, modal, badge, askOnOpen })
  return { relay, store, modal, badge }
}

describe('linkFairCredit', () => {
  it('abre o modal vazio quando a aba ainda não escolheu', () => {
    const { modal, relay } = linked()
    expect(modal.opened).toEqual([null])
    expect(relay.users).toEqual([])
  })

  it('o ID escolhido vai à sala, ao selo e à aba', () => {
    const { modal, relay, badge, store } = linked()
    modal.choose(42)
    expect(relay.users).toEqual([42])
    expect(badge.user).toBe(42)
    expect(store.read()).toBe(42)
  })

  it('jogar sem ID também fica guardado', () => {
    const { modal, relay, store } = linked()
    modal.choose(null)
    expect(relay.users).toEqual([null])
    expect(store.read()).toBeNull()
  })

  it('a página aberta pergunta de novo, vazio, mesmo com ID guardado na aba', () => {
    const { modal, relay } = linked(42, true)
    expect(modal.opened).toEqual([null])
    expect(relay.users).toEqual([])
  })

  it('na recarga da troca de mapa, segue com o ID guardado sem abrir o modal', () => {
    const { modal, relay, badge } = linked(42)
    expect(modal.opened).toEqual([])
    expect(relay.users).toEqual([42])
    expect(badge.user).toBe(42)
  })

  it('o botão do selo reabre o modal com o ID atual', () => {
    const { modal, badge } = linked(42)
    badge.requestChange()
    expect(modal.opened).toEqual([42])
  })

  it('o botão do selo antes de escolher abre o modal vazio', () => {
    const { modal, badge } = linked()
    badge.requestChange()
    expect(modal.opened).toEqual([null, null])
  })

  it('mostra o crédito no selo', () => {
    const { relay, badge } = linked(42)
    relay.credit({ status: 'credited', bricks: 2 })
    relay.credit({ status: 'none', bricks: 0 })
    expect(badge.credits).toEqual(['+2 TIJOLINHOS NA FEIRA'])
  })
})
