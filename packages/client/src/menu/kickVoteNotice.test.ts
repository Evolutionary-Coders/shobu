import type { KickVoteRefusal } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { KickVoteNotice } from '../net/kickVotePort.ts'
import {
  type KickNoticeScreen,
  kickRefusalText,
  kickVoteNoticeText,
  showKickVoteNotices,
} from './kickVoteNotice.ts'

const REFUSALS: readonly KickVoteRefusal[] = [
  'not-enough-humans',
  'target-is-bot',
  'target-is-self',
  'target-not-seated',
  'vote-in-progress',
  'cooldown',
  'target-protected',
  'join-grace',
  'not-host',
  'not-present',
]

describe('kickVoteNoticeText', () => {
  it.each([
    ['passed', 'RAIDEN FOI EXPULSO DA SALA'],
    ['failed', 'VOTO CONTRA RAIDEN FALHOU'],
    ['cancelled', 'VOTO CONTRA RAIDEN CANCELADO'],
  ] as const)('o voto %s', (outcome, text) => {
    const notice: KickVoteNotice = {
      kind: 'closed',
      closed: { targetId: 'x', targetName: 'RAIDEN', outcome },
    }
    expect(kickVoteNoticeText(notice, 3)).toBe(text)
  })

  it('a entrada desviada diz de que sala', () => {
    expect(kickVoteNoticeText({ kind: 'rerouted', address: '203.0.113.7' }, 3)).toBe(
      'VOCÊ FOI EXPULSO DE 203.0.113.7 · NOVA SALA',
    )
  })

  it('a recusa diz o motivo, com o mínimo da config', () => {
    expect(kickVoteNoticeText({ kind: 'refused', reason: 'not-enough-humans' }, 3)).toBe(
      'PRECISA DE 3 JOGADORES NA SALA',
    )
  })

  it('cada recusa tem uma frase própria', () => {
    const texts = REFUSALS.map((reason) => kickRefusalText(reason, 3))
    expect(new Set(texts).size).toBe(REFUSALS.length)
  })
})

/** A tela de mentira: o controle da arena, o menu e o hud, e os avisos a entregar. */
class FakeNoticeScreen implements KickNoticeScreen {
  readonly pending: KickVoteNotice[] = []
  readonly menuNotices: (string | null)[] = []
  readonly callouts: string[] = []
  readonly minHumans = 3
  #control: (inControl: boolean) => void = () => {}

  readonly network = {
    drainKickVoteNotices: (visit: (notice: KickVoteNotice) => void) => {
      for (const notice of this.pending.splice(0)) visit(notice)
    },
  }

  readonly renderer = {
    onPlayerControlChange: (listener: (inControl: boolean) => void) => {
      this.#control = listener
    },
  }

  readonly menu = { setNotice: (notice: string | null) => this.menuNotices.push(notice) }
  readonly hud = { showCallout: (text: string) => this.callouts.push(text) }

  takeControl(inControl: boolean): void {
    this.#control(inControl)
  }
}

describe('showKickVoteNotices', () => {
  it('no menu vira a nota dele; na arena, a chamada do alto', () => {
    const screen = new FakeNoticeScreen()
    const frames: (() => void)[] = []
    showKickVoteNotices(screen, (tick) => frames.push(tick))
    screen.pending.push({ kind: 'refused', reason: 'cooldown' })
    frames.shift()?.()
    screen.takeControl(true)
    screen.pending.push({ kind: 'rerouted', address: '203.0.113.7' })
    frames.shift()?.()
    expect(screen.menuNotices).toEqual(['AGUARDE PARA ABRIR OUTRA VOTAÇÃO'])
    expect(screen.callouts).toEqual(['VOCÊ FOI EXPULSO DE 203.0.113.7 · NOVA SALA'])
    expect(frames).toHaveLength(1)
  })
})
