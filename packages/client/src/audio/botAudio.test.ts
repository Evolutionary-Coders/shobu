import { readFileSync } from 'node:fs'
import {
  type BotPlayer,
  createBotPlayer,
  createNavGraph,
  parseGameplayConfig,
  type Vector3,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import type { AudioMixer } from './audioMixer.ts'
import { botStepsLoopName, createBotAudio } from './botAudio.ts'
import { sfxUrl } from './soundCatalog.ts'
import { SOUND_FALLOFF } from './soundFalloff.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const GRAPH = createNavGraph([{ name: 'aqui', feetM: { x: 0, y: 0, z: 0 } }], [])
const LISTENER: Vector3 = { x: 0, y: 1.66, z: 0 }

interface PlayedAt {
  readonly url: string
  readonly positionM: Vector3
  readonly gain: number
  readonly delayS: number | undefined
}

interface LoopedAt {
  readonly name: string
  readonly url: string | undefined
  readonly gain: number
  readonly rate: number | undefined
}

/** Anota os sons com posição em vez de tocá-los. */
class FakeSpatialMixer implements Pick<AudioMixer, 'playAt' | 'loopAt'> {
  readonly played: PlayedAt[] = []
  readonly looped: LoopedAt[] = []

  playAt(url: string, positionM: Readonly<Vector3>, gain: number, delayS?: number): void {
    this.played.push({ url, positionM: { ...positionM }, gain, delayS })
  }

  loopAt(
    name: string,
    url: string | undefined,
    _at: Readonly<Vector3>,
    gain: number,
    rate?: number,
  ): void {
    this.looped.push({ name, url, gain, rate })
  }
}

/** Um bot de pé a `z` metros do ouvido, olhando para ele. */
function botAt(z: number): BotPlayer {
  const bot = createBotPlayer(
    { id: 'bot-0', callsign: 'ONRYO', seed: 1 },
    { x: 0, y: 0, z },
    GRAPH,
    config,
  )
  bot.body.grounded = true
  bot.eyeM.z = z
  bot.eyeM.y = 1.66
  bot.aimM.z = -1
  return bot
}

function mount(bots: BotPlayer[], inPlay = true) {
  const mixer = new FakeSpatialMixer()
  const audio = createBotAudio(config, bots.length)
  const frame = () => audio.frame({ bots, listenerM: LISTENER, inPlay, mixer })
  frame()
  mixer.played.length = 0
  mixer.looped.length = 0
  return { mixer, frame }
}

function fire(bot: BotPlayer): void {
  bot.weapon.shotsFired += 1
  bot.weapon.roundsInMagazine -= 1
}

describe('createBotAudio: os efeitos', () => {
  it('o tiro de perto soa do cano, com o ferrolho logo depois', () => {
    const bot = botAt(10)
    const { mixer, frame } = mount([bot])
    fire(bot)
    frame()
    expect(mixer.played.map((sound) => sound.url)).toEqual([
      sfxUrl('shot-sniper'),
      sfxUrl('shot-reload'),
    ])
    expect(mixer.played[0]?.positionM.z).toBeCloseTo(10 - 0.55)
    expect(mixer.played[1]?.delayS).toBeGreaterThan(0)
  })

  /** O tiro denuncia a posição: de longe ele ainda soa, o clique do ferrolho não. */
  it('de longe, o tiro soa mais baixo e o ferrolho some', () => {
    const bot = botAt(80)
    const { mixer, frame } = mount([bot])
    fire(bot)
    frame()
    expect(mixer.played.map((sound) => sound.url)).toEqual([sfxUrl('shot-sniper')])
    expect(mixer.played[0]?.gain).toBeLessThan(0.5)
    expect(mixer.played[0]?.gain).toBeGreaterThan(0)
  })

  it('além do alcance do tiro, nem pede voz', () => {
    const bot = botAt(SOUND_FALLOFF['shot-sniper'].silentBeyondM + 10)
    const { mixer, frame } = mount([bot])
    fire(bot)
    frame()
    expect(mixer.played).toEqual([])
  })

  it('a aterrissagem sai do pé', () => {
    const bot = botAt(5)
    const { mixer, frame } = mount([bot])
    bot.body.grounded = false
    frame()
    bot.body.grounded = true
    frame()
    expect(mixer.played.map((sound) => [sound.url, sound.positionM.y])).toEqual([
      [sfxUrl('landing-after-jump'), 0],
    ])
  })

  it('a recarga do bot também soa', () => {
    const bot = botAt(5)
    const { mixer, frame } = mount([bot])
    bot.weapon.reloadLeftS = 1
    frame()
    expect(mixer.played.map((sound) => sound.url)).toEqual([sfxUrl('reload')])
  })

  it('a lista de bots menor que a de ouvidos não quebra', () => {
    const { mixer } = mount([botAt(5)])
    createBotAudio(config, 2).frame({ bots: [], listenerM: LISTENER, inPlay: true, mixer })
    expect(mixer.played).toEqual([])
  })
})

describe('createBotAudio: a passada', () => {
  function running(bot: BotPlayer): BotPlayer {
    bot.body.velocity.x = config.movement.sprintSpeedMps
    return bot
  }

  it('o bot correndo perto toca o próprio laço de passada', () => {
    const { mixer, frame } = mount([running(botAt(8))])
    frame()
    expect(mixer.looped).toEqual([
      { name: botStepsLoopName(0), url: sfxUrl('running'), gain: expect.any(Number), rate: 1 },
    ])
    expect(mixer.looped[0]?.gain).toBeGreaterThan(0)
  })

  /** Passada é coisa de perto: além de ~22 m o laço cala. */
  it('longe, o laço cala', () => {
    const { mixer, frame } = mount([running(botAt(30))])
    frame()
    expect(mixer.looped[0]?.url).toBeUndefined()
  })

  it('parado, morto ou com a arena pausada, o laço cala', () => {
    const still = mount([botAt(8)])
    still.frame()
    const dead = running(botAt(8))
    dead.alive = false
    const corpse = mount([dead])
    corpse.frame()
    const paused = mount([running(botAt(8))], false)
    paused.frame()
    expect([still, corpse, paused].map((rig) => rig.mixer.looped[0]?.url)).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('cada bot tem o próprio laço', () => {
    expect(new Set([0, 1, 2].map(botStepsLoopName)).size).toBe(3)
  })
})
