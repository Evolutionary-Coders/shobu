import type { WeaponConfig } from '@shobu/core'
import { boltCue, nowCue, reloadCue, type SoundCue } from './soundTiming.ts'

/**
 * Os efeitos que este quadro dispara, lidos como **borda** entre dois quadros.
 *
 * Nenhum estado novo na simulação: tudo aqui já existe no `WeaponState` e no
 * `CharacterState`, e o que faltava era comparar com o quadro anterior. É a
 * mesma ideia da guarda de segundo inteiro do relógio — o laço roda por
 * quadro, e quase nada dispara.
 *
 * Cada disparo sai com **quando** e **de que ponto do arquivo** tocar: o
 * ferrolho e a recarga vivem no meio dos respectivos takes, e tocá-los do
 * começo os deixava fora de hora (`soundTiming.ts`).
 *
 * ```ts
 * const cues = createSoundCues(config.weapon)
 * cues.since(sample) // [{ name: 'shot-sniper', ... }, { name: 'shot-reload', ... }]
 * ```
 */
export interface AudioWorldSample {
  /** Contador monotônico de tiros. A borda dele é o disparo. */
  readonly shotsFired: number
  readonly roundsInMagazine: number
  readonly reloading: boolean
  readonly scoped: boolean
  readonly grounded: boolean
}

export interface SoundCues {
  /** Os efeitos deste quadro. Vetor reaproveitado: vale até a próxima chamada. */
  since(sample: Readonly<AudioWorldSample>): readonly SoundCue[]
}

export function createSoundCues(config: WeaponConfig): SoundCues {
  const previous: AudioWorldSample = {
    shotsFired: 0,
    roundsInMagazine: 0,
    reloading: false,
    scoped: false,
    grounded: true,
  }
  const cues: SoundCue[] = []
  return {
    since: (sample) => {
      cues.length = 0
      collectCues(previous, sample, config, cues)
      Object.assign(previous, sample)
      return cues
    },
  }
}

function collectCues(
  previous: Readonly<AudioWorldSample>,
  sample: Readonly<AudioWorldSample>,
  config: WeaponConfig,
  into: SoundCue[],
): void {
  if (sample.shotsFired > previous.shotsFired) collectShot(sample, config, into)
  if (sample.reloading && !previous.reloading) into.push(reloadCue(config))
  if (sample.scoped && !previous.scoped) into.push(nowCue('scope'))
  if (sample.grounded && !previous.grounded) into.push(nowCue('landing-after-jump'))
}

/**
 * O tiro é sempre o take **seco**, e o ferrolho é um disparo à parte, recortado
 * do take que os traz juntos. Tocar aquele take inteiro punha o último clique
 * depois de o ferrolho já ter fechado.
 *
 * O pente vazio não cicla ferrolho — o que vem depois dele é a recarga —,
 * então ali o clique não sai.
 */
function collectShot(
  sample: Readonly<AudioWorldSample>,
  config: WeaponConfig,
  into: SoundCue[],
): void {
  into.push(nowCue('shot-sniper'))
  if (sample.roundsInMagazine > 0) into.push(boltCue(config))
}
