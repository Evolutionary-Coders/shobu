import { describe, expect, it } from 'vitest'
import { config } from '../bots/botTestKit.ts'
import { isScorestreakAvailable, scorestreakBySlug } from './scorestreakCatalog.ts'
import {
  createScorestreakSlots,
  DEFAULT_SCORESTREAK_LOADOUT,
  earnScorestreaks,
  forgetScorestreakLife,
  parseScorestreakLoadout,
  resetScorestreakSlots,
  sameScorestreakLoadout,
  spendScorestreak,
} from './scorestreakSlots.ts'

const costs = config.scorestreaks

function freshSlots() {
  return createScorestreakSlots(['ping', 'rapid-bolt', 'orbital-strike'])
}

describe('parseScorestreakLoadout', () => {
  it('aceita três slugs distintos do catálogo', () => {
    expect(parseScorestreakLoadout(['ping', 'sonar', 'emp'])).toEqual(['ping', 'sonar', 'emp'])
  })

  it('o padrão só leva disponíveis, uma de cada peso', () => {
    expect(DEFAULT_SCORESTREAK_LOADOUT.every(isScorestreakAvailable)).toBe(true)
    expect(DEFAULT_SCORESTREAK_LOADOUT.map((slug) => scorestreakBySlug(slug).tier)).toEqual([
      'leve',
      'media',
      'pesada',
    ])
  })

  it('o padrão passa na própria validação', () => {
    expect(parseScorestreakLoadout([...DEFAULT_SCORESTREAK_LOADOUT])).toEqual(
      DEFAULT_SCORESTREAK_LOADOUT,
    )
  })

  it.each([
    ['menos de três', ['ping', 'sonar']],
    ['mais de três', ['ping', 'sonar', 'emp', 'echo']],
    ['repetido', ['ping', 'ping', 'emp']],
    ['slug desconhecido', ['ping', 'uav', 'emp']],
    ['série bloqueada', ['ping', 'sonar', 'orbital-strike']],
    ['não é texto', ['ping', 7, 'emp']],
    ['não é lista', 'ping'],
  ])('recusa %s, dizendo o que veio', (_, raw) => {
    expect(() => parseScorestreakLoadout(raw)).toThrow(JSON.stringify(raw))
  })
})

describe('earnScorestreaks', () => {
  it('abaixo do custo da mais barata, nada fica pronto', () => {
    const slots = freshSlots()
    expect(earnScorestreaks(slots, costs.pingCost - 1, costs, [])).toEqual([])
    expect(slots.ready).toEqual([false, false, false])
  })

  it('ao atingir o custo, a série fica pronta e o índice sai como recém-ganho', () => {
    const slots = freshSlots()
    expect(earnScorestreaks(slots, costs.pingCost, costs, [])).toEqual([0])
    expect(slots.ready).toEqual([true, false, false])
  })

  it('pontos que pagam várias de uma vez ganham todas no mesmo tick', () => {
    const slots = freshSlots()
    expect(earnScorestreaks(slots, costs.orbitalStrikeCost, costs, [])).toEqual([0, 1, 2])
  })

  it('cada série sai uma vez por vida: a kill seguinte não a dá de novo', () => {
    const slots = freshSlots()
    earnScorestreaks(slots, costs.pingCost, costs, [])
    spendScorestreak(slots, 0)
    expect(earnScorestreaks(slots, costs.pingCost + 100, costs, [])).toEqual([])
    expect(slots.ready[0]).toBe(false)
  })

  it('a vida nova pode ganhar de novo', () => {
    const slots = freshSlots()
    earnScorestreaks(slots, costs.pingCost, costs, [])
    spendScorestreak(slots, 0)
    forgetScorestreakLife(slots)
    expect(earnScorestreaks(slots, costs.pingCost, costs, [])).toEqual([0])
  })

  it('reaproveita o vetor de saída, esvaziando-o antes', () => {
    const into = [9, 9]
    earnScorestreaks(freshSlots(), 0, costs, into)
    expect(into).toEqual([])
  })
})

describe('spendScorestreak', () => {
  it('gasta a série pronta e devolve o slug', () => {
    const slots = freshSlots()
    earnScorestreaks(slots, costs.pingCost, costs, [])
    expect(spendScorestreak(slots, 0)).toBe('ping')
    expect(slots.ready[0]).toBe(false)
  })

  it('apertar a série que não está pronta não faz nada', () => {
    expect(spendScorestreak(freshSlots(), 2)).toBeUndefined()
  })
})

describe('morte e partida nova', () => {
  it('série ganha e guardada atravessa a morte', () => {
    const slots = freshSlots()
    earnScorestreaks(slots, costs.pingCost, costs, [])
    forgetScorestreakLife(slots)
    expect(spendScorestreak(slots, 0)).toBe('ping')
  })

  it('a partida nova apaga o que estava guardado', () => {
    const slots = freshSlots()
    earnScorestreaks(slots, costs.orbitalStrikeCost, costs, [])
    resetScorestreakSlots(slots)
    expect(slots.ready).toEqual([false, false, false])
    expect(slots.earnedThisLife).toEqual([false, false, false])
  })
})

describe('sameScorestreakLoadout', () => {
  it('é a mesma só com as mesmas séries na mesma ordem e no mesmo tamanho', () => {
    expect(sameScorestreakLoadout(['ping', 'sonar', 'emp'], ['ping', 'sonar', 'emp'])).toBe(true)
    expect(sameScorestreakLoadout(['ping', 'sonar', 'emp'], ['sonar', 'ping', 'emp'])).toBe(false)
    // a da sala não conferia o tamanho: uma escolha mais curta passava por igual.
    expect(sameScorestreakLoadout(['ping', 'sonar', 'emp'], ['ping', 'sonar'])).toBe(false)
  })
})
