import { describe, expect, it } from 'vitest'
import {
  createNarratorQueue,
  INTRO_AT_S,
  MATCH_MARK_PRIORITY,
  medalPriority,
  NARRATOR_CLIP_S,
  NARRATOR_COOLDOWN_S,
} from './narratorQueue.ts'

const COMUM = medalPriority('comum')
const LENDARIA = medalPriority('lendaria')

/** Quando a boca do narrador volta a ficar livre depois de uma fala. */
const FREE_AT_S = NARRATOR_CLIP_S + NARRATOR_COOLDOWN_S

describe('o relógio da partida, que volta a zero', () => {
  /** Regressão: com a fala da partida anterior anotada, a nova ficava muda. */
  it('a partida nova fala de novo, mesmo depois de uma fala tardia da anterior', () => {
    const queue = createNarratorQueue()
    queue.request(MATCH_MARK_PRIORITY, 200)
    expect(queue.request(MATCH_MARK_PRIORITY, 0)).toBe(true)
  })

  /** Regressão: a apresentação, anotada no zero, calava o `match-start`. */
  it('a apresentação do menu não cala o começo da primeira partida', () => {
    const queue = createNarratorQueue()
    queue.request(MATCH_MARK_PRIORITY, INTRO_AT_S)
    expect(queue.request(MATCH_MARK_PRIORITY, 0)).toBe(true)
  })
})

describe('createNarratorQueue', () => {
  it('a primeira fala sai', () => {
    expect(createNarratorQueue().request(COMUM, 0)).toBe(true)
  })

  it('a segunda fala no meio da primeira é descartada', () => {
    const queue = createNarratorQueue()
    queue.request(COMUM, 0)
    expect(queue.request(COMUM, 1)).toBe(false)
  })

  it('a lendária corta a comum no meio', () => {
    const queue = createNarratorQueue()
    queue.request(COMUM, 0)
    expect(queue.request(LENDARIA, 1)).toBe(true)
  })

  it('a comum não corta a lendária', () => {
    const queue = createNarratorQueue()
    queue.request(LENDARIA, 0)
    expect(queue.request(COMUM, 1)).toBe(false)
  })

  it('empate de raridade não corta: a primeira termina', () => {
    const queue = createNarratorQueue()
    queue.request(LENDARIA, 0)
    expect(queue.request(LENDARIA, 1)).toBe(false)
  })

  it('acabada a fala, o cooldown ainda segura a próxima', () => {
    const queue = createNarratorQueue()
    queue.request(COMUM, 0)
    expect(queue.request(COMUM, NARRATOR_CLIP_S + NARRATOR_COOLDOWN_S / 2)).toBe(false)
  })

  it('passado o cooldown, a próxima sai', () => {
    const queue = createNarratorQueue()
    queue.request(COMUM, 0)
    expect(queue.request(COMUM, FREE_AT_S)).toBe(true)
  })

  it('a fala cortada não segura a boca pelo tempo que não usou', () => {
    const queue = createNarratorQueue()
    queue.request(COMUM, 0)
    queue.request(LENDARIA, 1)
    expect(queue.request(COMUM, 1 + FREE_AT_S)).toBe(true)
  })

  it('sem cooldown, uma fala sai logo depois da outra', () => {
    const queue = createNarratorQueue(0)
    queue.request(COMUM, 0)
    expect(queue.request(COMUM, NARRATOR_CLIP_S)).toBe(true)
  })

  it.each([-1, Number.NaN])('recusa cooldown %s, dizendo o valor', (cooldownS) => {
    expect(() => createNarratorQueue(cooldownS)).toThrow(`cooldownS recebeu ${cooldownS}`)
  })
})

describe('medalPriority', () => {
  it('cresce com a raridade', () => {
    const ordem = (['comum', 'incomum', 'rara', 'lendaria'] as const).map(medalPriority)
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b))
    expect(new Set(ordem).size).toBe(4)
  })

  it('o marco de partida fala acima de comum e abaixo de lendária', () => {
    expect(MATCH_MARK_PRIORITY).toBeGreaterThan(medalPriority('comum'))
    expect(MATCH_MARK_PRIORITY).toBeLessThan(medalPriority('lendaria'))
  })
})
