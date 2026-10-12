import {
  type BotPlayer,
  type GameplayConfig,
  horizontalSpeed,
  isReloading,
  type Vector3,
} from '@shobu/core'
import { botMuzzleM } from '../character/botAvatarPose.ts'
import { type AudioWorldSample, createSoundCues, type SoundCues } from './arenaSoundCues.ts'
import type { AudioMixer } from './audioMixer.ts'
import { createFootstepTrack, footstepLoopFor, type MutableFootstepTrack } from './footstepLoop.ts'
import { sfxUrl } from './soundCatalog.ts'
import { audibleGain, distanceBetweenM, SOUND_FALLOFF } from './soundFalloff.ts'
import type { SoundCue } from './soundTiming.ts'

/**
 * O que os bots fazem soar, de onde e a que volume: tiro, ferrolho, recarga,
 * luneta, aterrissagem e passada de cada um, com a posição dele e o ganho da
 * distância até o ouvido do jogador. Antes, nada disso tocava — o jogador
 * morria sem ouvir o tiro que o matou (playtest de 11/10).
 *
 * Os efeitos são as **mesmas bordas** do jogador (`arenaSoundCues.ts`), um
 * leitor por bot; a passada é o mesmo laço (`footstepLoop.ts`), um nome por
 * bot. Quem posiciona é o mixer (`playAt`, `loopAt`); aqui é só a política,
 * testada sem navegador.
 *
 * ```ts
 * const botAudio = createBotAudio(config, session.bots.length)
 * botAudio.frame({ bots: session.bots, listenerM: eyeM, inPlay: true, mixer })
 * ```
 */
export interface BotAudio {
  frame(scene: BotAudioScene): void
}

export interface BotAudioScene {
  readonly bots: readonly BotPlayer[]
  /** O ouvido do jogador, em metros do mundo: é dele que a distância é medida. */
  readonly listenerM: Readonly<Vector3>
  /** A arena rodando. Parada (o jogador no menu), os bots congelam e a passada cala. */
  readonly inPlay: boolean
  readonly mixer: Pick<AudioMixer, 'playAt' | 'loopAt'>
}

/** O nome do laço de passada do bot `index`. Um por bot, e por isso dois bots não se calam. */
export function botStepsLoopName(index: number): string {
  return `passo-bot-${index}`
}

interface BotEar {
  readonly cues: SoundCues
  readonly sample: { -readonly [Key in keyof AudioWorldSample]: AudioWorldSample[Key] }
  readonly loopName: string
  readonly steps: MutableFootstepTrack
  /** A amostra da passada, reescrita por quadro. */
  readonly stride: { inPlay: boolean; grounded: boolean; groundSpeedMps: number }
}

export function createBotAudio(config: GameplayConfig, botCount: number): BotAudio {
  const ears: BotEar[] = Array.from({ length: botCount }, (_, index) => ({
    cues: createSoundCues(config.weapon),
    sample: { shotsFired: 0, roundsInMagazine: 0, reloading: false, scoped: false, grounded: true },
    loopName: botStepsLoopName(index),
    steps: createFootstepTrack(),
    stride: { inPlay: false, grounded: true, groundSpeedMps: 0 },
  }))
  const muzzle: Vector3 = { x: 0, y: 0, z: 0 }
  return {
    frame: (scene) => {
      for (let index = 0; index < ears.length; index += 1) {
        const bot = scene.bots[index]
        if (!bot) continue
        const ear = ears[index] as BotEar
        playBotCues(scene, bot, ear.cues.since(sampleBot(bot, ear.sample)), muzzle)
        playBotSteps(scene, bot, ear, config)
      }
    },
  }
}

function sampleBot(bot: BotPlayer, into: BotEar['sample']): AudioWorldSample {
  into.shotsFired = bot.weapon.shotsFired
  into.roundsInMagazine = bot.weapon.roundsInMagazine
  into.reloading = isReloading(bot.weapon)
  into.scoped = bot.weapon.scoped
  into.grounded = bot.body.grounded
  return into
}

/**
 * Os efeitos saem da arma: do cano, que é onde o rastro começa. Só a
 * aterrissagem sai do pé. Longe demais para ser ouvido, o som nem pede voz.
 */
function playBotCues(
  scene: BotAudioScene,
  bot: BotPlayer,
  cues: readonly SoundCue[],
  muzzle: Vector3,
): void {
  for (const cue of cues) {
    const at =
      cue.name === 'landing-after-jump' ? bot.body.position : botMuzzleM(bot.eyeM, bot.aimM, muzzle)
    const gain = audibleGain(distanceBetweenM(scene.listenerM, at), SOUND_FALLOFF[cue.name])
    if (gain <= 0) continue
    scene.mixer.playAt(sfxUrl(cue.name), at, gain, cue.delayS, cue.offsetS)
  }
}

function playBotSteps(
  scene: BotAudioScene,
  bot: BotPlayer,
  ear: BotEar,
  config: GameplayConfig,
): void {
  const feetM = bot.body.position
  ear.stride.inPlay = scene.inPlay && bot.alive
  ear.stride.grounded = bot.body.grounded
  ear.stride.groundSpeedMps = horizontalSpeed(bot.body)
  const track = footstepLoopFor(ear.stride, config.movement, ear.steps)
  const gain = track
    ? audibleGain(distanceBetweenM(scene.listenerM, feetM), SOUND_FALLOFF[track.name])
    : 0
  const url = track && gain > 0 ? sfxUrl(track.name) : undefined
  scene.mixer.loopAt(ear.loopName, url, feetM, gain, track?.rate ?? 1)
}
