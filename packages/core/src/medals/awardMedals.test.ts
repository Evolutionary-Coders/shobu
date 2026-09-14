import { describe, expect, it } from 'vitest'
import gameplay from '../../../../config/gameplay.json' with { type: 'json' }
import { parseGameplayConfig } from '../config/parseGameplayConfig.ts'
import { createKillEvent, type KillEvent, type MutableKillEvent } from '../scoring/killEvent.ts'
import { applyKill, createScoreboard, type Scoreboard } from '../scoring/scoreboard.ts'
import { awardMedals, createMedalAwards } from './awardMedals.ts'
import type { MedalSlug } from './medalCatalog.ts'

/**
 * Os valores vêm de `config/gameplay.json` e não de literal no teste: a
 * ADR 0005 manda que afinar medalha não exija build, e teste com número
 * próprio é a forma de a configuração deixar de ser a fonte sem ninguém ver.
 */
const CONFIG = parseGameplayConfig(gameplay)
const MEDALS = CONFIG.medals
const POINTS_PER_KILL = CONFIG.match.pointsPerKill

function killOf(over: Partial<KillEvent> = {}): KillEvent {
  return Object.assign(createKillEvent() as MutableKillEvent, {
    shooterId: 'a',
    victimId: 'b',
    scoped: true,
    ...over,
  })
}

/** Concede e aplica, na ordem em que o jogo faz. Devolve os slugs concedidos. */
function scoreKill(board: Scoreboard, event: KillEvent): readonly MedalSlug[] {
  const awards = awardMedals(board, event, MEDALS, createMedalAwards())
  const slugs = awards.map((award) => award.medal.slug)
  applyKill(board, event, POINTS_PER_KILL)
  return slugs
}

function medalsOf(event: KillEvent): readonly MedalSlug[] {
  return scoreKill(createScoreboard(), event)
}

describe('medalhas de uma kill só', () => {
  it('tiro sem luneta é no-scope', () => {
    expect(medalsOf(killOf({ scoped: false }))).toContain('no-scope')
  })

  it('tiro com luneta não é no-scope', () => {
    expect(medalsOf(killOf({ scoped: true }))).not.toContain('no-scope')
  })

  it('a primeira kill da partida é first-blood', () => {
    expect(medalsOf(killOf())).toContain('first-blood')
  })

  it('a segunda kill da partida já não é first-blood', () => {
    const board = createScoreboard()
    scoreKill(board, killOf({ atS: 0 }))
    expect(scoreKill(board, killOf({ atS: 90 }))).not.toContain('first-blood')
  })

  it('atirador sem contato com o chão é airborne', () => {
    expect(medalsOf(killOf({ shooterAirborne: true }))).toContain('airborne')
  })

  it('vítima no ar é skeet', () => {
    expect(medalsOf(killOf({ victimAirborne: true }))).toContain('skeet')
  })

  it('acerto no terço superior da cápsula é headshot', () => {
    expect(medalsOf(killOf({ hitHeightRatio: 0.9 }))).toContain('headshot')
  })

  it('acerto na cintura não é headshot', () => {
    expect(medalsOf(killOf({ hitHeightRatio: 0.5 }))).not.toContain('headshot')
  })

  it('o limiar do headshot é inclusivo', () => {
    const event = killOf({ hitHeightRatio: MEDALS.headshotHeightRatio })
    expect(medalsOf(event)).toContain('headshot')
  })

  it('matar quem te matou é payback', () => {
    const board = createScoreboard()
    scoreKill(board, killOf({ shooterId: 'b', victimId: 'a', atS: 0 }))
    expect(scoreKill(board, killOf({ atS: 90 }))).toContain('payback')
  })

  it('matar quem nunca te matou não é payback', () => {
    expect(medalsOf(killOf())).not.toContain('payback')
  })

  /** Senão dois jogadores trocando kills levariam o bônus em todas elas. */
  it('a vingança é cobrada uma vez: a kill seguinte na mesma vítima não paga', () => {
    const board = createScoreboard()
    scoreKill(board, killOf({ shooterId: 'b', victimId: 'a', atS: 0 }))
    expect(scoreKill(board, killOf({ atS: 90 }))).toContain('payback')
    expect(scoreKill(board, killOf({ atS: 180 }))).not.toContain('payback')
  })

  it('morrer de novo para o mesmo rival rearma a vingança', () => {
    const board = createScoreboard()
    scoreKill(board, killOf({ shooterId: 'b', victimId: 'a', atS: 0 }))
    scoreKill(board, killOf({ atS: 90 }))
    scoreKill(board, killOf({ shooterId: 'b', victimId: 'a', atS: 180 }))
    expect(scoreKill(board, killOf({ atS: 270 }))).toContain('payback')
  })

  it('derrubar quem estava em sequência é buzzkill', () => {
    const board = createScoreboard()
    for (let kill = 0; kill < MEDALS.buzzkillStreak; kill += 1) {
      scoreKill(board, killOf({ shooterId: 'b', victimId: 'c', atS: kill * 90 }))
    }
    expect(scoreKill(board, killOf({ atS: 900 }))).toContain('buzzkill')
  })

  it('derrubar quem não estava em sequência não é buzzkill', () => {
    expect(medalsOf(killOf())).not.toContain('buzzkill')
  })

  it('a sequência da vítima é lida antes de a kill zerá-la', () => {
    const board = createScoreboard()
    for (let kill = 0; kill < MEDALS.buzzkillStreak; kill += 1) {
      scoreKill(board, killOf({ shooterId: 'b', victimId: 'c', atS: kill * 90 }))
    }
    scoreKill(board, killOf({ atS: 900 }))
    expect(board.players.get('b')?.streak).toBe(0)
  })
})

describe('medalhas que esperam mecânica', () => {
  it.each(['knife', 'backstab', 'on-the-rope', 'collateral', '360-no-scope'] as const)(
    '%s não acende com o evento neutro de hoje',
    (slug) => {
      expect(medalsOf(killOf({ scoped: false, shooterAirborne: true }))).not.toContain(slug)
    },
  )

  it('knife acende no dia em que a arma de corpo a corpo existir', () => {
    expect(medalsOf(killOf({ weapon: 'knife' }))).toContain('knife')
  })

  it('backstab acende com o ângulo da vítima, e engole a knife', () => {
    const event = killOf({ weapon: 'knife', victimFacingAwayDeg: 170 })
    expect(medalsOf(event)).toContain('backstab')
    expect(medalsOf(event)).not.toContain('knife')
  })

  it('on-the-rope acende com o gancho engatado', () => {
    expect(medalsOf(killOf({ shooterGrappling: true }))).toContain('on-the-rope')
  })

  it('collateral acende com duas vítimas no mesmo raio', () => {
    expect(medalsOf(killOf({ victimsInShot: 2 }))).toContain('collateral')
  })

  it('360-no-scope acende com giro, sem luneta e sem chão', () => {
    const event = killOf({ scoped: false, shooterAirborne: true, shooterYawTurnDeg: 400 })
    expect(medalsOf(event)).toContain('360-no-scope')
  })
})

describe('a escada de multikill', () => {
  /** Kills encadeadas a um segundo de distância: cabem em todas as janelas. */
  function chain(count: number): readonly (readonly MedalSlug[])[] {
    const board = createScoreboard()
    return Array.from({ length: count }, (_unused, index) =>
      scoreKill(board, killOf({ atS: index })),
    )
  }

  it('a segunda kill em janela é double kill', () => {
    expect(chain(2).at(-1)).toContain('double-kill')
  })

  it('a terceira é triple kill, e o double não aparece de novo', () => {
    const last = chain(3).at(-1)
    expect(last).toContain('triple-kill')
    expect(last).not.toContain('double-kill')
  })

  it('a quarta é overkill', () => {
    expect(chain(4).at(-1)).toContain('overkill')
  })

  it('a quinta é kill chain', () => {
    expect(chain(5).at(-1)).toContain('kill-chain')
  })

  it('kill fora da janela recomeça a escada', () => {
    const board = createScoreboard()
    scoreKill(board, killOf({ atS: 0 }))
    expect(scoreKill(board, killOf({ atS: MEDALS.doubleKillWindowS + 1 }))).not.toContain(
      'double-kill',
    )
  })

  it('cinco kills encadeadas somam exatamente o valor do topo da escada', () => {
    const board = createScoreboard()
    for (let index = 0; index < 5; index += 1) scoreKill(board, killOf({ atS: index }))
    const bonus = (board.players.get('a')?.points ?? 0) - 5 * POINTS_PER_KILL
    const firstBlood = MEDALS.bonusIncomum
    expect(bonus).toBe(MEDALS.bonusKillChain + firstBlood)
  })

  /**
   * As janelas não são encaixadas: kills em 0, 1, 2, 14 e 15 s alcançam o
   * `kill-chain` sem nunca terem alcançado o `overkill`. Descontar o degrau
   * imediatamente anterior pagava 250 por esta sequência.
   */
  it('a sequência que pula um degrau ainda soma o valor do topo', () => {
    const board = createScoreboard()
    for (const atS of [0, 1, 2, 14, 15]) scoreKill(board, killOf({ atS }))
    const bonus = (board.players.get('a')?.points ?? 0) - 5 * POINTS_PER_KILL
    expect(bonus).toBe(MEDALS.bonusKillChain + MEDALS.bonusIncomum)
  })

  it('alcançar o kill chain sem overkill concede só o kill chain', () => {
    const board = createScoreboard()
    const concedidas = [0, 1, 2, 14, 15].map((atS) => scoreKill(board, killOf({ atS })))
    expect(concedidas.at(-1)).toContain('kill-chain')
    expect(concedidas.flat()).not.toContain('overkill')
  })

  it('uma sequência nova depois de uma longa pausa paga o degrau inteiro', () => {
    const board = createScoreboard()
    for (let index = 0; index < 5; index += 1) scoreKill(board, killOf({ atS: index }))
    const antes = board.players.get('a')?.points ?? 0
    scoreKill(board, killOf({ atS: 600 }))
    scoreKill(board, killOf({ atS: 601 }))
    const bonus = (board.players.get('a')?.points ?? 0) - antes - 2 * POINTS_PER_KILL
    expect(bonus).toBe(MEDALS.bonusIncomum)
  })

  it('a escada é estritamente crescente, senão o topo dela não existe', () => {
    const degraus = [MEDALS.bonusIncomum, MEDALS.bonusRara, MEDALS.bonusLendaria]
    expect(degraus).toEqual([...degraus].sort((a, b) => a - b))
    expect(MEDALS.bonusKillChain).toBeGreaterThan(MEDALS.bonusLendaria)
  })

  it('as janelas crescem com o degrau, para compensar o ciclo de ferrolho', () => {
    const janelas = [
      MEDALS.doubleKillWindowS,
      MEDALS.tripleKillWindowS,
      MEDALS.overkillWindowS,
      MEDALS.killChainWindowS,
    ]
    expect(janelas).toEqual([...janelas].sort((a, b) => a - b))
  })
})

describe('acúmulo', () => {
  it('um 360 no scope paga a lendária, e não soma o no-scope e o airborne', () => {
    const board = createScoreboard()
    const event = killOf({
      scoped: false,
      shooterAirborne: true,
      shooterYawTurnDeg: 400,
      hitHeightRatio: 0,
    })
    const slugs = scoreKill(board, event)
    expect(slugs).not.toContain('no-scope')
    expect(slugs).not.toContain('airborne')
    const bonus = (board.players.get('a')?.points ?? 0) - POINTS_PER_KILL
    expect(bonus).toBe(MEDALS.bonusLendaria + MEDALS.bonusIncomum)
  })

  it('o tiro longo sem luneta engole o no-scope', () => {
    const slugs = medalsOf(killOf({ scoped: false, distanceM: MEDALS.longshotM }))
    expect(slugs).toContain('longshot-no-scope')
    expect(slugs).not.toContain('no-scope')
  })

  it('abaixo do limiar continua sendo só no-scope', () => {
    const slugs = medalsOf(killOf({ scoped: false, distanceM: MEDALS.longshotM - 1 }))
    expect(slugs).toContain('no-scope')
    expect(slugs).not.toContain('longshot-no-scope')
  })

  it('famílias independentes somam: tiro longo sem luneta com double kill', () => {
    const board = createScoreboard()
    scoreKill(board, killOf({ atS: 0 }))
    const slugs = scoreKill(board, killOf({ atS: 1, scoped: false, distanceM: 90 }))
    expect(slugs).toEqual(expect.arrayContaining(['longshot-no-scope', 'double-kill']))
  })

  it('o headshot é independente de tudo e soma com o no-scope', () => {
    const slugs = medalsOf(killOf({ scoped: false, hitHeightRatio: 1 }))
    expect(slugs).toEqual(expect.arrayContaining(['no-scope', 'headshot']))
  })
})

describe('crédito no placar', () => {
  it('credita a soma dos bônus ao atirador, por cima dos pontos da kill', () => {
    const board = createScoreboard()
    scoreKill(board, killOf({ scoped: false }))
    const esperado = POINTS_PER_KILL + MEDALS.bonusComum + MEDALS.bonusIncomum
    expect(board.players.get('a')?.points).toBe(esperado)
  })

  it('matar a si mesmo não concede medalha nenhuma', () => {
    expect(medalsOf(killOf({ shooterId: 'a', victimId: 'a', scoped: false }))).toEqual([])
  })

  it('reaproveita o vetor que recebe, e não devolve outro', () => {
    const into = createMedalAwards()
    const devolvido = awardMedals(createScoreboard(), killOf(), MEDALS, into)
    expect(devolvido).toBe(into)
  })

  it('limpa o vetor entre kills: a medalha de ontem não fica no feed', () => {
    const board = createScoreboard()
    const into = createMedalAwards()
    awardMedals(board, killOf({ scoped: false }), MEDALS, into)
    applyKill(board, killOf({ scoped: false }), POINTS_PER_KILL)
    awardMedals(board, killOf({ atS: 900, scoped: true }), MEDALS, into)
    expect(into.map((award) => award.medal.slug)).toEqual([])
  })
})
