import {
  type BotPlayer,
  confirmScorestreakEarned,
  DEFAULT_SCORESTREAK_LOADOUT,
  type Fighter,
  MATCH_SEED_BASE,
  type PlayerScore,
  pickBotScorestreaks,
  type ScorestreakEffects,
  type ScorestreakLedger,
  type ScorestreakNotice,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { AHEAD, mountOnline, snapshotAt } from './arenaOnlineTestKit.ts'
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
function giveLifePoints(rig: Pick<Rig, 'session'>, playerId: string, points: number): void {
  ;(rig.session.scoreboard.players.get(playerId) as PlayerScore).scorestreakPoints = points
}

function ledgerOf(rig: Rig): ScorestreakLedger {
  return rig.session.scorestreaks as ScorestreakLedger
}

function localReady(rig: Pick<Rig, 'session'>): readonly boolean[] {
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
    confirmScorestreakEarned(ledgerOf(rig), LOCAL_PLAYER_ID, 0, 'ping')
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
    confirmScorestreakEarned(ledgerOf(rig), LOCAL_PLAYER_ID, 0, 'ping')
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

  it('a kill leva os efeitos do corpo da vítima, e só dela', () => {
    const rig = mountSession()
    const { timers } = rig.session.scorestreakEffects as ScorestreakEffects
    for (const fighter of rig.session.fighters)
      timers.set(fighter.id, new Map([['rapid-bolt', 999]]))
    killBot(rig)
    const dead = rig.session.fighters.filter((fighter) => !timers.has(fighter.id))
    expect(dead).toHaveLength(1)
    expect(dead[0]?.id).not.toBe(LOCAL_PLAYER_ID)
  })

  it('o FERROLHO RÁPIDO solta a arma de quem o tem, jogador ou bot, e só a dele', () => {
    const rig = mountSession()
    const { timers } = rig.session.scorestreakEffects as ScorestreakEffects
    const bot = rig.session.bots[0] as BotPlayer
    timers.set(LOCAL_PLAYER_ID, new Map([['rapid-bolt', 999]]))
    rig.frame()
    expect([rig.session.weapon.boltFree, bot.weapon.boltFree]).toEqual([true, false])
    timers.set(bot.id, new Map([['rapid-bolt', 999]]))
    rig.frame()
    expect(bot.weapon.boltFree).toBe(true)
  })

  it('o GANCHO OVERCLOCK solta o gancho de quem o tem, jogador ou bot, e só o dele', () => {
    const rig = mountSession()
    const { timers } = rig.session.scorestreakEffects as ScorestreakEffects
    const bot = rig.session.bots[0] as BotPlayer
    timers.set(LOCAL_PLAYER_ID, new Map([['grapple-overclock', 999]]))
    rig.frame()
    expect([rig.session.character.current.grappleFree, bot.body.grappleFree]).toEqual([true, false])
    timers.set(bot.id, new Map([['grapple-overclock', 999]]))
    rig.frame()
    expect(bot.body.grappleFree).toBe(true)
  })

  it('o PULSO EMP tranca a luneta e o gancho dos outros, e não os do dono', () => {
    const rig = mountSession()
    const { timers } = rig.session.scorestreakEffects as ScorestreakEffects
    const bot = rig.session.bots[0] as BotPlayer
    timers.set(bot.id, new Map([['emp', 999]]))
    rig.frame()
    const { weapon, character } = rig.session
    expect([weapon.scopeLocked, character.current.grappleLocked]).toEqual([true, true])
    expect([bot.weapon.scopeLocked, bot.body.grappleLocked]).toEqual([false, false])
    timers.set(LOCAL_PLAYER_ID, new Map([['emp', 999]]))
    rig.frame()
    expect([bot.weapon.scopeLocked, bot.body.grappleLocked]).toEqual([true, true])
  })

  it('a morte fora da área deixa ganhar de novo e guarda a série pronta', () => {
    const rig = mountSession([FLOOR], OUTSIDE_EAST)
    const { timers } = rig.session.scorestreakEffects as ScorestreakEffects
    timers.set(LOCAL_PLAYER_ID, new Map([['rapid-bolt', 999]]))
    confirmScorestreakEarned(ledgerOf(rig), LOCAL_PLAYER_ID, 0, 'ping')
    const graceFrames = Math.ceil(config.match.outOfBoundsGraceS / FRAME_S) + 2
    for (let frame = 0; frame < graceFrames; frame += 1) rig.frame()
    expect(rig.session.boundaryDeaths).toBe(1)
    const slots = rig.session.scorestreaks.slotsById.get(LOCAL_PLAYER_ID)
    expect([slots?.earnedThisLife[0], slots?.ready[0]]).toEqual([false, true])
    expect(timers.has(LOCAL_PLAYER_ID)).toBe(false)
  })

  it('a partida nova zera o que estava pronto e vale a escolha do menu', () => {
    const rig = mountSession()
    confirmScorestreakEarned(ledgerOf(rig), LOCAL_PLAYER_ID, 0, 'ping')
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
    confirmScorestreakEarned(parts.scorestreaks, LOCAL_PLAYER_ID, 2, 'emp')
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
    confirmScorestreakEarned(parts.scorestreaks, LOCAL_PLAYER_ID, 0, 'ping')
    latchScorestreakSlot(parts.scorestreakTrigger, 0)
    spendLocalScorestreakPress(parts)
    expect(parts.scorestreakNotices).toEqual([])
    expect(takeScorestreakSlot(parts.scorestreakTrigger)).toBe(0)
  })
})

describe('as séries de pontuação seguindo a sala', () => {
  it('a escolha vai à sala na entrada e só de novo quando muda', () => {
    const rig = mountOnline()
    rig.frame()
    rig.frame()
    rig.session.restartMatch({
      ...ROOM_RULES,
      hostileBots: false,
      scorestreaks: ['echo', 'sonar', 'emp'],
    })
    rig.frame()
    expect(rig.room.scorestreakLoadouts).toEqual([
      DEFAULT_SCORESTREAK_LOADOUT,
      ['echo', 'sonar', 'emp'],
    ])
  })

  it('o aperto vira pedido à sala, e a série só sai quando ela confirma', () => {
    const rig = mountOnline()
    rig.frame()
    rig.room.scorestreaksEarned.push({ slot: 0, scorestreak: 'ping' })
    rig.frame()
    expect(rig.session.lastScorestreakNotices).toEqual([
      { kind: 'earned', playerId: LOCAL_PLAYER_ID, slot: 0, scorestreak: 'ping' },
    ])
    latchScorestreakSlot(rig.session.scorestreakTrigger, 0)
    rig.frame()
    expect(rig.room.scorestreakRequests).toEqual([0])
    expect(localReady(rig)[0]).toBe(true)
    rig.room.scorestreaksActivated.push({ playerId: 'eu', slot: 0, scorestreak: 'ping' })
    rig.frame()
    expect(rig.session.lastScorestreakNotices).toEqual([
      { kind: 'activated', playerId: LOCAL_PLAYER_ID, slot: 0, scorestreak: 'ping' },
    ])
    expect(localReady(rig)[0]).toBe(false)
  })

  it('morto, o aperto não vira pedido nem fica para o respawn', () => {
    const rig = mountOnline()
    rig.frame()
    ;(rig.session.local as Fighter).alive = false
    latchScorestreakSlot(rig.session.scorestreakTrigger, 1)
    rig.frame()
    ;(rig.session.local as Fighter).alive = true
    rig.frame()
    expect(rig.room.scorestreakRequests).toEqual([])
  })

  it('a série de outro jogador vira aviso com o id da vaga dele', () => {
    const rig = mountOnline()
    rig.room.remotes.set('ana', snapshotAt(AHEAD))
    rig.frame()
    rig.room.scorestreaksActivated.push({ playerId: 'ana', slot: 2, scorestreak: 'emp' })
    rig.room.scorestreaksActivated.push({ playerId: 'ninguem', slot: 0, scorestreak: 'ping' })
    rig.frame()
    expect(rig.session.lastScorestreakNotices).toEqual([
      { kind: 'activated', playerId: 'bot-0', slot: 2, scorestreak: 'emp' },
    ])
  })

  it('online os fantoches saem do livro, e voltam com os bots quando a sala cai', () => {
    const rig = mountOnline()
    rig.frame()
    expect([...rig.session.scorestreaks.slotsById.keys()]).toEqual([LOCAL_PLAYER_ID])
    rig.room.ownId = undefined
    rig.frame()
    const ids = rig.session.bots.map((bot) => bot.id)
    expect([...rig.session.scorestreaks.slotsById.keys()]).toEqual([LOCAL_PLAYER_ID, ...ids])
    expect([...rig.session.scorestreaks.autoSpenders]).toEqual(ids)
  })

  it('o aviso de ganho de uma série que o slot já não tem é ignorado', () => {
    const rig = mountOnline()
    rig.frame()
    rig.room.scorestreaksEarned.push({ slot: 0, scorestreak: 'sonar' })
    rig.frame()
    expect(localReady(rig)).toEqual([false, false, false])
    expect(rig.session.lastScorestreakNotices).toEqual([])
  })

  it('a sala que cai deixa o jogador com a série pronta e os pontos da vida', () => {
    // offline o cliente volta a decidir: o que a sala já tinha dado continua valendo.
    const rig = mountOnline()
    rig.frame()
    rig.room.scorestreaksEarned.push({ slot: 0, scorestreak: 'ping' })
    giveLifePoints(rig, LOCAL_PLAYER_ID, 450)
    rig.frame()
    rig.room.ownId = undefined
    rig.frame()
    expect(localReady(rig)).toEqual([true, false, false])
    const local = rig.session.scoreboard.players.get(LOCAL_PLAYER_ID) as PlayerScore
    expect(local.scorestreakPoints).toBe(450)
  })

  it('a sala nova começa sem série pronta', () => {
    const rig = mountOnline()
    rig.frame()
    confirmScorestreakEarned(
      rig.session.scorestreaks as ScorestreakLedger,
      LOCAL_PLAYER_ID,
      1,
      'rapid-bolt',
    )
    rig.room.ownId = 'outra-sala'
    rig.frame()
    expect(rig.session.scorestreaks.slotsById.get(LOCAL_PLAYER_ID)?.ready).toEqual([
      false,
      false,
      false,
    ])
  })
})
