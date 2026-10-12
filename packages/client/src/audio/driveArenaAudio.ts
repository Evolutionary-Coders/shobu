import type { Scene } from '@babylonjs/core/scene'
import {
  type GameplayConfig,
  horizontalSpeed,
  isReloading,
  type MedalAward,
  type Vector3,
} from '@shobu/core'
import type { ArenaSession } from '../controller/arenaSession.ts'
import type { SessionMode } from '../hud/matchClock.ts'
import { type AudioWorldSample, createSoundCues } from './arenaSoundCues.ts'
import type { AudioMixer } from './audioMixer.ts'
import { createBotAudio } from './botAudio.ts'
import { createDeathCall, DEATH_PRIORITY, type LifeSituation } from './deathCall.ts'
import {
  createFootstepTrack,
  FOOTSTEP_LOOP,
  type FootstepSample,
  footstepLoopFor,
  type MutableFootstepTrack,
} from './footstepLoop.ts'
import { createMatchMarks, type MatchSituation } from './matchMarks.ts'
import { MUSIC_PLAYLIST_URLS } from './musicProgram.ts'
import type { Narrator } from './narrator.ts'
import { MATCH_MARK_PRIORITY, medalPriority } from './narratorQueue.ts'
import { medalStingerUrl, sfxUrl } from './soundCatalog.ts'
import type { SoundCue } from './soundTiming.ts'

/**
 * Leva o estado da sessão para o mixer, por quadro — o gêmeo de
 * `driveArenaReadouts.ts`, e com a mesma dependência de ordem: registrado
 * **depois** do passo da sessão, senão a medalha e o tiro chegam um quadro
 * atrasados.
 *
 * O laço roda a 60 Hz e quase nada toca: os efeitos são bordas
 * (`arenaSoundCues.ts`), o passo é um laço que só muda quando o ritmo muda, e
 * a música é um pedido idempotente que o mixer descarta quando a trilha já é
 * essa.
 *
 * ```ts
 * driveArenaAudio(scene, { config, session, mixer, mode: () => 'match', inArena })
 * ```
 */
export interface ArenaAudioOptions {
  readonly config: GameplayConfig
  readonly session: ArenaSession
  readonly mixer: AudioMixer
  readonly narrator: Narrator
  readonly mode: () => SessionMode
  readonly inArena: () => boolean
  /**
   * Escreve onde está o ouvido do jogador e para onde ele olha: a câmera,
   * neste quadro. É contra ele que os sons dos bots escolhem lado e volume.
   */
  readonly listen: (eyeOut: Vector3, forwardOut: Vector3) => void
}

export function driveArenaAudio(scene: Scene, options: ArenaAudioOptions): void {
  const cues = createSoundCues(options.config.weapon)
  const marks = createMatchMarks()
  const deaths = createDeathCall()
  const hearBots = createBotHearing(options)
  const scratch = createAudioScratch()
  scene.onBeforeRenderObservable.add(() => {
    const situation = situationOf(options, scratch.situation)
    playCues(options, cues.since(sampleOf(options.session, scratch.sample)))
    playFootsteps(options, scratch)
    hearBots(situation.inArena)
    playMedalStinger(options)
    announceMedals(options, situation.secondsLeft)
    announceMark(options, marks.since(situation), situation.secondsLeft)
    const life = lifeOf(options, situation.inArena, scratch.life)
    announceDeath(options, deaths.since(life), situation.secondsLeft)
    options.mixer.stream(MUSIC_PLAYLIST_URLS)
  })
}

type Writable<Shape> = { -readonly [Key in keyof Shape]: Shape[Key] }

/**
 * O que o laço escreve a cada quadro, montado uma vez: um literal por quadro
 * — a situação, a amostra dos efeitos, a da passada — era lixo no caminho
 * quente, como o `botAudio.ts` já evitava para os bots.
 */
interface AudioScratch {
  readonly situation: Writable<MatchSituation>
  readonly life: Writable<LifeSituation>
  readonly sample: Writable<AudioWorldSample>
  readonly stride: Writable<FootstepSample>
  readonly steps: MutableFootstepTrack
}

function createAudioScratch(): AudioScratch {
  return {
    situation: { inArena: false, mode: 'match', secondsLeft: 0 },
    life: { inArena: false, alive: false },
    sample: {
      shotsFired: 0,
      roundsInMagazine: 0,
      reloading: false,
      scoped: false,
      grounded: false,
    },
    stride: { inPlay: false, grounded: false, groundSpeedMps: 0 },
    steps: createFootstepTrack(),
  }
}

/**
 * O ouvido segue a câmera, e os bots soam contra ele (`botAudio.ts`). A cena
 * do áudio dos bots é montada uma vez e reescrita por quadro: um literal por
 * quadro seria lixo no caminho quente.
 */
function createBotHearing(options: ArenaAudioOptions): (inPlay: boolean) => void {
  const bots = createBotAudio(options.config, options.session.bots.length)
  const forwardM: Vector3 = { x: 0, y: 0, z: 1 }
  const heard = {
    bots: options.session.bots,
    listenerM: { x: 0, y: 0, z: 0 },
    inPlay: false,
    mixer: options.mixer,
  }
  return (inPlay) => {
    options.listen(heard.listenerM, forwardM)
    options.mixer.placeListener(heard.listenerM, forwardM)
    heard.inPlay = inPlay
    bots.frame(heard)
  }
}

/**
 * O narrador comenta **a medalha mais rara da kill**, e não todas: três falas
 * por uma kill só seriam três frases atropeladas, e a fila descartaria duas
 * delas de qualquer jeito. `nowS` é o relógio da partida, nunca `Date.now()`.
 */
function announceMedals(options: ArenaAudioOptions, secondsLeft: number): void {
  const best = options.session.lastMedals.reduce(rarest, undefined as MedalAward | undefined)
  if (!best) return
  options.narrator.say(
    best.medal.slug,
    medalPriority(best.medal.rarity),
    elapsed(options, secondsLeft),
  )
}

function rarest(best: MedalAward | undefined, award: MedalAward): MedalAward {
  if (!best) return award
  return medalPriority(award.medal.rarity) > medalPriority(best.medal.rarity) ? award : best
}

function announceMark(
  options: ArenaAudioOptions,
  mark: string | undefined,
  secondsLeft: number,
): void {
  if (mark) options.narrator.say(mark, MATCH_MARK_PRIORITY, elapsed(options, secondsLeft))
}

/** A queda do jogador: cada persona tem a sua fala para ela (`scripts/narrator/personas/`). */
function announceDeath(options: ArenaAudioOptions, died: boolean, secondsLeft: number): void {
  if (died) options.narrator.say('death', DEATH_PRIORITY, elapsed(options, secondsLeft))
}

function lifeOf(
  options: ArenaAudioOptions,
  inArena: boolean,
  into: AudioScratch['life'],
): LifeSituation {
  into.inArena = inArena
  into.alive = options.session.local.alive
  return into
}

/** Segundos desde o começo da partida: é o relógio que a fila do narrador usa. */
function elapsed(options: ArenaAudioOptions, secondsLeft: number): number {
  return options.config.match.durationS - secondsLeft
}

function sampleOf(session: ArenaSession, into: AudioScratch['sample']): AudioWorldSample {
  into.shotsFired = session.weapon.shotsFired
  into.roundsInMagazine = session.weapon.roundsInMagazine
  into.reloading = isReloading(session.weapon)
  into.scoped = session.weapon.scoped
  into.grounded = session.character.current.grounded
  return into
}

function playCues(options: ArenaAudioOptions, cues: readonly SoundCue[]): void {
  for (const cue of cues) options.mixer.play('sfx', sfxUrl(cue.name), cue.delayS, cue.offsetS)
}

function playFootsteps(options: ArenaAudioOptions, scratch: AudioScratch): void {
  const character = options.session.character.current
  const { stride } = scratch
  stride.inPlay = options.inArena() && options.session.local.alive
  stride.grounded = character.grounded
  stride.groundSpeedMps = horizontalSpeed(character)
  const track = footstepLoopFor(stride, options.config.movement, scratch.steps)
  options.mixer.loop(FOOTSTEP_LOOP, 'sfx', track && sfxUrl(track.name), track?.rate)
}

/**
 * Um stinger por kill, e não por medalha: três medalhas na mesma kill tocariam
 * três vezes o mesmo sino em cima de si mesmo. O take toca é o da **maior**
 * raridade da kill, que é a que o jogador quer ouvir.
 */
function playMedalStinger(options: ArenaAudioOptions): void {
  const medals = options.session.lastMedals
  if (medals.length === 0) return
  options.mixer.play('sfx', medalStingerUrl(medals.some(isRare)))
}

function isRare(award: MedalAward): boolean {
  return award.medal.rarity === 'rara' || award.medal.rarity === 'lendaria'
}

function situationOf(options: ArenaAudioOptions, into: AudioScratch['situation']): MatchSituation {
  into.secondsLeft = options.config.match.durationS - options.session.matchTimeS
  into.mode = options.mode()
  into.inArena = options.inArena()
  return into
}
