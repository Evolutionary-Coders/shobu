import { describe, expect, it } from 'vitest'
import type { KickVoteView } from '../net/kickVoteView.ts'
import { kickVotePromptOf, sameKickVotePrompt } from './kickVotePrompt.ts'

const VIEW: KickVoteView = {
  targetId: 'bia',
  targetName: 'RAIDEN',
  initiatorId: 'ana',
  leftS: 17.2,
  yes: 1,
  no: 0,
  needed: 2,
  isTarget: false,
  isEligible: true,
  ownBallot: undefined,
}

describe('kickVotePromptOf', () => {
  it('sem voto, sem faixa', () => {
    expect(kickVotePromptOf(undefined)).toBeNull()
  })

  it('quem vota vê o alvo, o tempo em segundos inteiros e só as contagens', () => {
    expect(kickVotePromptOf(VIEW)).toEqual({
      title: 'EXPULSAR RAIDEN?',
      countdown: '18 S',
      tally: 'SIM 1/2 · NÃO 0',
      mode: 'vote',
    })
  })

  it.each([
    [{ ownBallot: true }, 'voted'],
    [{ ownBallot: false }, 'voted'],
    [{ isEligible: false }, 'watch'],
    [{ isTarget: true, isEligible: false }, 'target'],
  ] as const)('%j fica em %s', (change, mode) => {
    expect(kickVotePromptOf({ ...VIEW, ...change })?.mode).toBe(mode)
  })

  it('o alvo lê que a votação é contra ele', () => {
    expect(kickVotePromptOf({ ...VIEW, isTarget: true })?.title).toBe('VOTAÇÃO PARA TE EXPULSAR')
  })

  it('o relógio não fica negativo', () => {
    expect(kickVotePromptOf({ ...VIEW, leftS: -0.1 })?.countdown).toBe('0 S')
  })
})

describe('sameKickVotePrompt', () => {
  const prompt = kickVotePromptOf(VIEW)

  it('compara campo a campo', () => {
    expect(sameKickVotePrompt(prompt, kickVotePromptOf(VIEW))).toBe(true)
    expect(sameKickVotePrompt(prompt, kickVotePromptOf({ ...VIEW, leftS: 3 }))).toBe(false)
    expect(sameKickVotePrompt(prompt, kickVotePromptOf({ ...VIEW, yes: 2 }))).toBe(false)
    expect(sameKickVotePrompt(prompt, kickVotePromptOf({ ...VIEW, targetName: 'X' }))).toBe(false)
    expect(sameKickVotePrompt(prompt, kickVotePromptOf({ ...VIEW, ownBallot: true }))).toBe(false)
  })

  it('a falta de faixa só é igual a outra falta', () => {
    expect(sameKickVotePrompt(null, null)).toBe(true)
    expect(sameKickVotePrompt(prompt, null)).toBe(false)
    expect(sameKickVotePrompt(null, prompt)).toBe(false)
  })
})
