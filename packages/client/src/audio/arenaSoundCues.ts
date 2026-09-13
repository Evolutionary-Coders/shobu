import type { SfxName } from './soundCatalog.ts'

/**
 * Os efeitos que este quadro dispara, lidos como **borda** entre dois quadros.
 *
 * Nenhum estado novo na simulação: tudo aqui já existe no `WeaponState` e no
 * `CharacterState`, e o que faltava era comparar com o quadro anterior. É a
 * mesma ideia da guarda de segundo inteiro do relógio — o laço roda por
 * quadro, e quase nada dispara.
 *
 * ```ts
 * const cues = createSoundCues()
 * cues.since(sample) // ['shot-reload']
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
  since(sample: Readonly<AudioWorldSample>): readonly SfxName[]
}

export function createSoundCues(): SoundCues {
  const previous: AudioWorldSample = {
    shotsFired: 0,
    roundsInMagazine: 0,
    reloading: false,
    scoped: false,
    grounded: true,
  }
  const cues: SfxName[] = []
  return {
    since: (sample) => {
      cues.length = 0
      collectCues(previous, sample, cues)
      Object.assign(previous, sample)
      return cues
    },
  }
}

function collectCues(
  previous: Readonly<AudioWorldSample>,
  sample: Readonly<AudioWorldSample>,
  into: SfxName[],
): void {
  if (sample.shotsFired > previous.shotsFired) into.push(shotOf(sample))
  if (sample.reloading && !previous.reloading) into.push('reload')
  if (sample.scoped && !previous.scoped) into.push('scope')
  if (sample.grounded && !previous.grounded) into.push('landing-after-jump')
}

/**
 * O tiro que esvaziou o pente é o take **seco**; os outros são o take com o
 * ferrolho, que traz os dois cliques em ~1,3 s — casando com o
 * `weapon.boltCycleS`. Tocar o take com ferrolho na última bala somaria o
 * clique do ferrolho por cima do som da recarga, que começa logo em seguida.
 */
function shotOf(sample: Readonly<AudioWorldSample>): SfxName {
  return sample.roundsInMagazine === 0 ? 'shot-sniper' : 'shot-reload'
}
