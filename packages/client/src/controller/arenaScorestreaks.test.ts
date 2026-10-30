import {
  confirmScorestreakEarned,
  DEFAULT_SCORESTREAK_LOADOUT,
  type Fighter,
  MATCH_SEED_BASE,
  type PlayerScore,
  pickBotScorestreaks,
  type ScorestreakLedger,
  type ScorestreakNotice,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { createArenaParts } from './arenaParts.ts'
import { restartArenaScorestreaks, spendLocalScorestreakPress } from './arenaScorestreaks.ts'
import { LOCAL_PLAYER_ID } from './arenaSession.ts'
import {
  config,
  FLOOR,
  FRAME_S,
  mountSession,
  OUTSIDE_EAST,
  type Rig,
  ROOM_RULES,
  sessionOptionsFor,
  settleScope,
} from './arenaSessionTestKit.ts'
import { latchScorestreakSlot, takeScorestreakSlot } from './scorestreakTrigger.ts'
import { createWeaponInput } from './weaponInputFrom.ts'
import { createMovementInput } from './wishDirection.ts'

/** Pontos que pagam as três séries de qualquer escolha. */
const RICH = 100_000

/** O placar é só leitura pela sessão; o teste adianta os pontos da vida. */
function giveLifePoints(rig: Rig, playerId: string, points: number): void {
  ;(rig.session.scoreboard.players.get(playerId) as PlayerScore).scorestreakPoints = points
}

function ledgerOf(rig: Rig): ScorestreakLedger {
  return rig.session.scorestreaks as ScorestreakLedger
}

function localReady(rig: Rig): readonly boolean[] {
  return rig.session.scorestreaks.slotsById.get(LOCAL_PLAYER_ID)?.ready ?? []
}

/** Um quadro, com os avisos dele copiados: o quadro seguinte os zera. */
function frameNotices(rig: Rig): ScorestreakNotice[] {
  rig.frame()
  return [...rig.session.lastScorestreakNotices]
}

/** O tiro que mata o bot do posto, com os avisos de série do quadro do tiro. */
function killBot(rig: Rig): ScorestreakNotice[] {
  settleScope(rig)
  rig.weaponInput.fire = true
  const notices = frameNotices(rig)
  rig.weaponInput.fire = false
  rig.frame()
  return notices
}

function openParts() {
  const inputs = { weaponInput: createWeaponInput(), movementInput: createMovementInput() }
  return createArenaParts(sessionOptionsFor([FLOOR], {}, inputs))
}

describe('as séries de pontuação offline', () => {
  it('o jogador entra com as séries padrão, e cada bot com as da vaga dele', () => {
    const rig = mountSession()
    const { slotsById, autoSpenders } = rig.session.scorestreaks
    expect(slotsById.get(LOCAL_PLAYER_ID)?.loadout).toEqual(DEFAULT_SCORESTREAK_LOADOUT)
    expect(slotsById.get('bot-0')?.loadout).toEqual(pickBotScorestreaks(MATCH_SEED_BASE, 0))
    expect([...autoSpenders]).toEqual(rig.session.bots.map((bot) => bot.id))
  })

  it('a kill que passa do custo deixa a série pronta e avisa', () => {
    const rig = mountSession()
    giveLifePoints(rig, LOCAL_PLAYER_ID, RICH)
    const notices = killBot(rig)
    expect(notices.map((notice) => [notice.kind, notice.playerId, notice.scorestreak])).toEqual(
      DEFAULT_SCORESTREAK_LOADOUT.map((slug) => ['earned', LOCAL_PLAYER_ID, slug]),
    )
    expect(localReady(rig)).toEqual([true, true, true])
  })

  it('o aperto aciona a série pronta, uma vez, e avisa', () => {
    const rig = mountSession()
    confirmScorestreakEarned(ledgerOf(rig), LOCAL_PLAYER_ID, 0)
    latchScorestreakSlot(rig.session.scorestreakTrigger, 0)
    expect(frameNotices(rig)).toEqual([
      { kind: 'activated', playerId: LOCAL_PLAYER_ID, slot: 0, scorestreak: 'ping' },
    ])
    expect(localReady(rig)[0]).toBe(false)
    latchScorestreakSlot(rig.session.scorestreakTrigger, 0)
    expect(frameNotices(rig)).toEqual([])
  })

  it('o aperto numa série que não está pronta não faz nada', () => {
    const rig = mountSession()
    latchScorestreakSlot(rig.session.scorestreakTrigger, 1)
    expect(frameNotices(rig)).toEqual([])
  })

  it('o aperto com o jogador morto some, e não aciona no respawn', () => {
    const rig = mountSession()
    confirmScorestreakEarned(ledgerOf(rig), LOCAL_PLAYER_ID, 0)
    const local = rig.session.local as Fighter
    local.alive = false
    local.respawnLeftS = 1
    latchScorestreakSlot(rig.session.scorestreakTrigger, 0)
    expect(frameNotices(rig)).toEqual([])
    local.alive = true
    expect(frameNotices(rig)).toEqual([])
    expect(localReady(rig)[0]).toBe(true)
  })

  it('o bot que ganha uma série a aciona no mesmo quadro', () => {
    const rig = mountSession([FLOOR], { hostileBots: true })
    giveLifePoints(rig, 'bot-0', RICH)
    const kinds: string[] = []
    for (let frame = 0; frame < 10 / FRAME_S && rig.session.local.alive; frame += 1) {
      for (const notice of frameNotices(rig)) kinds.push(`${notice.kind}:${notice.playerId}`)
    }
    expect(kinds).toEqual([
      'earned:bot-0',
      'activated:bot-0',
      'earned:bot-0',
      'activated:bot-0',
      'earned:bot-0',
      'activated:bot-0',
    ])
  })

  it('a morte fora da área deixa ganhar de novo e guarda a série pronta', () => {
    const rig = mountSession([FLOOR], OUTSIDE_EAST)
    confirmScorestreakEarned(ledgerOf(rig), LOCAL_PLAYER_ID, 0)
    const graceFrames = Math.ceil(config.match.outOfBoundsGraceS / FRAME_S) + 2
    for (let frame = 0; frame < graceFrames; frame += 1) rig.frame()
    expect(rig.session.boundaryDeaths).toBe(1)
    const slots = rig.session.scorestreaks.slotsById.get(LOCAL_PLAYER_ID)
    expect([slots?.earnedThisLife[0], slots?.ready[0]]).toEqual([false, true])
  })

  it('a partida nova zera o que estava pronto e vale a escolha do menu', () => {
    const rig = mountSession()
    confirmScorestreakEarned(ledgerOf(rig), LOCAL_PLAYER_ID, 0)
    rig.session.restartMatch({ ...ROOM_RULES, hostileBots: false })
    expect(localReady(rig)).toEqual([false, false, false])
    rig.session.restartMatch({
      ...ROOM_RULES,
      hostileBots: false,
      scorestreaks: ['echo', 'sonar', 'emp'],
    })
    const slots = rig.session.scorestreaks.slotsById.get(LOCAL_PLAYER_ID)
    expect(slots?.loadout).toEqual(['echo', 'sonar', 'emp'])
  })
})

describe('as séries de pontuação online', () => {
  it('a partida nova guarda o que está pronto: as séries são da sala', () => {
    const parts = openParts()
    parts.online = true
    confirmScorestreakEarned(parts.scorestreaks, LOCAL_PLAYER_ID, 2)
    restartArenaScorestreaks(parts, { ...ROOM_RULES, hostileBots: false })
    restartArenaScorestreaks(parts, {
      ...ROOM_RULES,
      hostileBots: false,
      scorestreaks: DEFAULT_SCORESTREAK_LOADOUT,
    })
    expect(parts.scorestreaks.slotsById.get(LOCAL_PLAYER_ID)?.ready[2]).toBe(true)
  })

  it('o aperto fica para a sala, e o tick não aciona nada', () => {
    const parts = openParts()
    parts.online = true
    confirmScorestreakEarned(parts.scorestreaks, LOCAL_PLAYER_ID, 0)
    latchScorestreakSlot(parts.scorestreakTrigger, 0)
    spendLocalScorestreakPress(parts)
    expect(parts.scorestreakNotices).toEqual([])
    expect(takeScorestreakSlot(parts.scorestreakTrigger)).toBe(0)
  })
})
