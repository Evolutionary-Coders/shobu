import { describe, expect, it } from 'vitest'
import {
  castKickBallot,
  closeKickVote,
  createKickVoteBook,
  hostOf,
  type KickRoomHuman,
  type KickRoomView,
  type KickVote,
  type KickVoteRules,
  kickVotesNeeded,
  kickVoteVerdict,
  requestKick,
} from './kickVote.ts'

const RULES: KickVoteRules = {
  kickVoteWindowS: 20,
  kickVoteCooldownS: 120,
  kickVoteProtectionS: 60,
  kickVoteJoinGraceS: 15,
  kickVoteMinHumans: 3,
}

function human(id: string, seatedAtS = 0, present = true): KickRoomHuman {
  return { id, seatedAtS, present }
}

function publicRoom(...ids: string[]): KickRoomView {
  return { visibility: 'public', humans: ids.map((id) => human(id)) }
}

function privateRoom(...ids: string[]): KickRoomView {
  return { visibility: 'private', humans: ids.map((id) => human(id)) }
}

/** Abre o voto de `ana` contra `bia` aos 30 s, ou falha o teste. */
function openVote(view: KickRoomView, book = createKickVoteBook()): KickVote {
  const result = requestKick(book, view, RULES, { initiatorId: 'ana', targetId: 'bia', nowS: 30 })
  if (result.kind !== 'opened') throw new Error(`esperado voto aberto; veio ${result.kind}`)
  return result.vote
}

function refusalOf(view: KickRoomView, targetId: string, nowS = 30, book = createKickVoteBook()) {
  const result = requestKick(book, view, RULES, { initiatorId: 'ana', targetId, nowS })
  return result.kind === 'refused' ? result.reason : result.kind
}

const ALL = new Set(['ana', 'bia', 'caio', 'duda'])

describe('kickVotesNeeded', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
  ])('com %i eleitores pede %i SIM', (eligible, needed) => {
    expect(kickVotesNeeded(eligible)).toBe(needed)
  })
})

describe('requestKick na sala pública', () => {
  it('abre o voto com quem abriu já no SIM e o alvo fora dos eleitores', () => {
    const vote = openVote(publicRoom('ana', 'bia', 'caio', 'duda'))
    expect([...vote.electorate]).toEqual(['ana', 'caio', 'duda'])
    expect(vote.ballots.get('ana')).toBe(true)
  })

  it('recusa dois humanos: um estranho não tira o outro sozinho', () => {
    expect(refusalOf(publicRoom('ana', 'bia'), 'bia')).toBe('not-enough-humans')
  })

  it('recusa quando os presentes não fazem dois eleitores', () => {
    const view: KickRoomView = {
      visibility: 'public',
      humans: [human('ana'), human('bia'), human('caio', 0, false)],
    }
    expect(refusalOf(view, 'bia')).toBe('not-enough-humans')
  })

  it.each([
    ['bot-1', 'target-is-bot'],
    ['ana', 'target-is-self'],
    ['ninguem', 'target-not-seated'],
  ])('recusa o alvo %s', (targetId, reason) => {
    expect(refusalOf(publicRoom('ana', 'bia', 'caio'), targetId)).toBe(reason)
  })

  it('recusa quem pede longe da sala', () => {
    const view: KickRoomView = {
      visibility: 'public',
      humans: [human('ana', 0, false), human('bia'), human('caio')],
    }
    expect(refusalOf(view, 'bia')).toBe('not-present')
  })

  it('recusa quem acabou de entrar', () => {
    const view: KickRoomView = {
      visibility: 'public',
      humans: [human('ana', 20), human('bia'), human('caio')],
    }
    expect(refusalOf(view, 'bia', 30)).toBe('join-grace')
  })

  it('um voto de cada vez', () => {
    const book = createKickVoteBook()
    const view = publicRoom('ana', 'bia', 'caio', 'duda')
    openVote(view, book)
    expect(refusalOf(view, 'caio', 31, book)).toBe('vote-in-progress')
  })

  it('quem abriu espera a recarga para abrir outro', () => {
    const book = createKickVoteBook()
    const view = publicRoom('ana', 'bia', 'caio', 'duda')
    openVote(view, book)
    closeKickVote(book, 'cancelled', 31, RULES)
    expect(refusalOf(view, 'caio', 149, book)).toBe('cooldown')
    expect(refusalOf(view, 'caio', 150, book)).toBe('opened')
  })

  it('o alvo de um voto que falhou fica protegido', () => {
    const book = createKickVoteBook()
    const view = publicRoom('ana', 'bia', 'caio', 'duda')
    openVote(view, book)
    closeKickVote(book, 'failed', 40, RULES)
    book.cooldownUntilS.clear()
    expect(refusalOf(view, 'bia', 99, book)).toBe('target-protected')
    expect(refusalOf(view, 'bia', 100, book)).toBe('opened')
  })

  it('abrir um voto esquece só as recargas vencidas', () => {
    const book = createKickVoteBook()
    book.cooldownUntilS.set('eva', 10)
    book.cooldownUntilS.set('caio', 90)
    openVote(publicRoom('ana', 'bia', 'caio', 'duda'), book)
    expect([...book.cooldownUntilS.keys()]).toEqual(['caio', 'ana'])
  })

  it('o voto passado ou cancelado não protege o alvo', () => {
    const book = createKickVoteBook()
    openVote(publicRoom('ana', 'bia', 'caio'), book)
    closeKickVote(book, 'passed', 40, RULES)
    expect(book.protectedUntilS.size).toBe(0)
    expect(book.vote).toBeUndefined()
  })

  it('fechar sem voto aberto não faz nada', () => {
    const book = createKickVoteBook()
    closeKickVote(book, 'failed', 40, RULES)
    expect(book.protectedUntilS.size).toBe(0)
  })
})

describe('requestKick na sala privada', () => {
  it('o anfitrião expulsa na hora, mesmo no um contra um', () => {
    const result = requestKick(createKickVoteBook(), privateRoom('ana', 'bia'), RULES, {
      initiatorId: 'ana',
      targetId: 'bia',
      nowS: 1,
    })
    expect(result).toEqual({ kind: 'kick-now', targetId: 'bia' })
  })

  it('quem não é o anfitrião é recusado', () => {
    const result = requestKick(createKickVoteBook(), privateRoom('bia', 'ana', 'caio'), RULES, {
      initiatorId: 'ana',
      targetId: 'caio',
      nowS: 30,
    })
    expect(result).toEqual({ kind: 'refused', reason: 'not-host' })
  })

  it('o anfitrião passa ao próximo humano quando sai', () => {
    expect(hostOf(privateRoom('ana', 'bia'))).toBe('ana')
    expect(hostOf(privateRoom('bia'))).toBe('bia')
    expect(hostOf(privateRoom())).toBeUndefined()
    expect(hostOf(publicRoom('ana'))).toBeUndefined()
  })
})

describe('kickVoteVerdict', () => {
  it('com quatro humanos, quem abriu e mais um passam antes da janela', () => {
    const vote = openVote(publicRoom('ana', 'bia', 'caio', 'duda'))
    expect(kickVoteVerdict(vote, ALL, 31, RULES)).toEqual({
      kind: 'open',
      yes: 1,
      no: 0,
      needed: 2,
      leftS: 19,
    })
    castKickBallot(vote, 'caio', true)
    expect(kickVoteVerdict(vote, ALL, 32, RULES)).toEqual({ kind: 'closed', outcome: 'passed' })
  })

  it('com três humanos, um NÃO já falha', () => {
    const vote = openVote(publicRoom('ana', 'bia', 'caio'))
    castKickBallot(vote, 'caio', false)
    expect(kickVoteVerdict(vote, ALL, 31, RULES)).toEqual({ kind: 'closed', outcome: 'failed' })
  })

  it('falha quando a janela acaba', () => {
    const vote = openVote(publicRoom('ana', 'bia', 'caio', 'duda'))
    expect(kickVoteVerdict(vote, ALL, 50, RULES)).toEqual({ kind: 'closed', outcome: 'failed' })
  })

  it.each(['ana', 'bia'])('cancela quando %s sai', (gone) => {
    const vote = openVote(publicRoom('ana', 'bia', 'caio', 'duda'))
    const present = new Set([...ALL].filter((id) => id !== gone))
    expect(kickVoteVerdict(vote, present, 31, RULES)).toEqual({
      kind: 'closed',
      outcome: 'cancelled',
    })
  })

  it('cancela quando sobra um eleitor só', () => {
    const vote = openVote(publicRoom('ana', 'bia', 'caio'))
    expect(kickVoteVerdict(vote, new Set(['ana', 'bia']), 31, RULES)).toEqual({
      kind: 'closed',
      outcome: 'cancelled',
    })
  })

  it('o eleitor que sai refaz o necessário', () => {
    const vote = openVote(publicRoom('ana', 'bia', 'caio', 'duda'))
    castKickBallot(vote, 'duda', false)
    const verdict = kickVoteVerdict(vote, new Set(['ana', 'bia', 'caio']), 31, RULES)
    expect(verdict).toEqual({ kind: 'open', yes: 1, no: 0, needed: 2, leftS: 19 })
  })

  it('quem chegou depois e o alvo não votam; votar de novo troca o voto', () => {
    const vote = openVote(publicRoom('ana', 'bia', 'caio', 'duda'))
    expect(castKickBallot(vote, 'eva', true)).toBe(false)
    expect(castKickBallot(vote, 'bia', false)).toBe(false)
    castKickBallot(vote, 'caio', false)
    castKickBallot(vote, 'caio', true)
    expect(kickVoteVerdict(vote, ALL, 31, RULES)).toEqual({ kind: 'closed', outcome: 'passed' })
  })
})
