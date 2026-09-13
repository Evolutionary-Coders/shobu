import type { Scene } from '@babylonjs/core/scene'
import { type GameplayConfig, horizontalSpeed, isReloading, type MedalAward } from '@shobu/core'
import type { ArenaSession } from '../controller/arenaSession.ts'
import type { SessionMode } from '../hud/matchClock.ts'
import { createSoundCues } from './arenaSoundCues.ts'
import type { AudioMixer } from './audioMixer.ts'
import { FOOTSTEP_LOOP, footstepLoopFor } from './footstepLoop.ts'
import { musicFor } from './musicProgram.ts'
import { medalStingerUrl, musicUrl, type SfxName, sfxUrl } from './soundCatalog.ts'

/**
 * Leva o estado da sessão para o mixer, por quadro — o gêmeo de
 * `driveArenaReadouts.ts`, e com a mesma dependência de ordem: registrado
 * **depois** do passo da sessão, senão a medalha e o tiro chegam um quadro
 * atrasados.
 *
 * O laço roda a 60 Hz e quase nada toca: os efeitos são bordas
 * (`arenaSoundCues.ts`), o passo é um laço que só muda quando o ritmo muda, e
 * a música é um pedido idempotente que o mixer descarta quando a faixa já é
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
  readonly mode: () => SessionMode
  readonly inArena: () => boolean
}

export function driveArenaAudio(scene: Scene, options: ArenaAudioOptions): void {
  const cues = createSoundCues()
  scene.onBeforeRenderObservable.add(() => {
    playCues(options, cues.since(sampleOf(options.session)))
    playFootsteps(options)
    playMedalStinger(options)
    options.mixer.stream(musicUrl(musicFor(situationOf(options))))
  })
}

function sampleOf(session: ArenaSession) {
  return {
    shotsFired: session.weapon.shotsFired,
    roundsInMagazine: session.weapon.roundsInMagazine,
    reloading: isReloading(session.weapon),
    scoped: session.weapon.scoped,
    grounded: session.character.current.grounded,
  }
}

function playCues(options: ArenaAudioOptions, cues: readonly SfxName[]): void {
  for (const cue of cues) options.mixer.play('sfx', sfxUrl(cue))
}

function playFootsteps(options: ArenaAudioOptions): void {
  const character = options.session.character.current
  const loop = footstepLoopFor(
    { grounded: character.grounded, groundSpeedMps: horizontalSpeed(character) },
    options.config.movement,
  )
  options.mixer.loop(FOOTSTEP_LOOP, 'sfx', loop ? sfxUrl(loop) : undefined)
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

function situationOf(options: ArenaAudioOptions) {
  const secondsLeft = options.config.match.durationS - options.session.matchTimeS
  const mode = options.mode()
  return {
    inArena: options.inArena(),
    mode,
    secondsLeft,
    matchOver: mode === 'match' && secondsLeft <= 0,
  }
}
