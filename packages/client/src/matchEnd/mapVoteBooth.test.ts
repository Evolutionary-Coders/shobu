import { RANDOM_MAP_OPTION } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  BOT_BALLOT_WINDOW,
  ballotsInView,
  castVote,
  choiceOf,
  closeVoteBooth,
  moveVoteFocus,
  openVoteBooth,
  RANDOM_MAP_LABEL,
} from './mapVoteBooth.ts'

const ARENAS = [
  { id: 'neon-kaido', label: 'NEON-KAIDŌ' },
  { id: 'ichiban-gai', label: 'ICHIBAN-GAI' },
]
const BOTS = ['bot-0', 'bot-1', 'bot-2']

describe('openVoteBooth', () => {
  it('os mapas e o aleatório por último, com o foco no primeiro', () => {
    const booth = openVoteBooth(ARENAS, BOTS, 1)
    expect(booth.choices).toEqual([...ARENAS, { id: RANDOM_MAP_OPTION, label: RANDOM_MAP_LABEL }])
    expect(booth.focus).toBe(0)
  })

  it('os votos dos bots já agendados, dentro da janela', () => {
    const booth = openVoteBooth(ARENAS, BOTS, 1)
    expect(booth.ballots).toHaveLength(BOTS.length)
    expect(ballotsInView(booth, BOT_BALLOT_WINDOW.fromS - 0.01)).toEqual([])
    expect(ballotsInView(booth, BOT_BALLOT_WINDOW.untilS)).toHaveLength(BOTS.length)
  })
})

describe('moveVoteFocus', () => {
  it('anda e dá a volta nas duas pontas', () => {
    const booth = openVoteBooth(ARENAS, [], 1)
    moveVoteFocus(booth, -1)
    expect(booth.focus).toBe(2)
    moveVoteFocus(booth, 1)
    expect(booth.focus).toBe(0)
    moveVoteFocus(booth, 4)
    expect(booth.focus).toBe(1)
  })
})

describe('castVote', () => {
  it('vota, leva o foco junto, e votar de novo troca o voto', () => {
    const booth = openVoteBooth(ARENAS, [], 1)
    castVote(booth, 'local', 1, 2)
    expect([booth.focus, choiceOf(booth, 'local')]).toEqual([1, 1])
    castVote(booth, 'local', 2, 3)
    expect([booth.focus, choiceOf(booth, 'local')]).toEqual([2, 2])
    expect(booth.ballots).toHaveLength(1)
  })

  it('fora da lista, nada acontece', () => {
    const booth = openVoteBooth(ARENAS, [], 1)
    castVote(booth, 'local', 3, 2)
    expect([booth.focus, choiceOf(booth, 'local')]).toEqual([0, -1])
  })
})

describe('closeVoteBooth', () => {
  it('o voto do jogador conta como qualquer outro', () => {
    const booth = openVoteBooth(ARENAS, [], 1)
    castVote(booth, 'local', 1, 2)
    expect(closeVoteBooth(booth)).toEqual({
      optionId: 'ichiban-gai',
      mapId: 'ichiban-gai',
      tied: false,
    })
  })
})
