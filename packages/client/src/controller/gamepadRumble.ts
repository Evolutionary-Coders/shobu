import type { ShotHit } from '@shobu/core'

/**
 * O tremor do controle, como dado: o que o `vibrationActuator.playEffect` do
 * navegador pede no efeito `dual-rumble`. O motor forte é o grave, do cabo; o
 * fraco é o agudo, do gatilho.
 */
export interface RumbleEffect {
  readonly duration: number
  readonly strongMagnitude: number
  readonly weakMagnitude: number
}

/**
 * Três degraus, e cada um mais longo e mais grave que o anterior: o jogador
 * distingue pela mão, sem olhar, se o tiro saiu, se pegou e se matou. O tiro é
 * curto e agudo para não virar ruído numa troca de tiros.
 */
export const RUMBLE_EFFECTS = {
  shot: { duration: 60, strongMagnitude: 0.08, weakMagnitude: 0.35 },
  hit: { duration: 90, strongMagnitude: 0.2, weakMagnitude: 0.45 },
  // a kill ia ao motor forte inteiro por 260 ms, e no headshot com medalha o
  // controle sacudia a mão (teste no xbox, 09/10): ela continua o degrau mais
  // alto, mas a diferença é de duração, não de força.
  kill: { duration: 160, strongMagnitude: 0.35, weakMagnitude: 0.5 },
} as const satisfies Record<string, RumbleEffect>

/** O que a vibração lê da sessão a cada quadro. */
export interface RumbleSample {
  /** O tiro do quadro, ou `undefined` quando a arma não disparou. */
  readonly shot: Readonly<ShotHit> | undefined
  /** As kills do jogador local. Contador: a borda dele é a kill. */
  readonly kills: number
}

export interface RumbleCues {
  /** O tremor deste quadro, ou `undefined`. */
  since(sample: Readonly<RumbleSample>): RumbleEffect | undefined
}

/**
 * Lê a kill como **borda** do contador, no molde do `arenaSoundCues.ts`, e não
 * pelas medalhas: nem toda kill dá medalha. Só o degrau mais alto sai — o
 * tiro que mata também acertou e também saiu, e três efeitos no mesmo quadro
 * se atropelariam no motor.
 *
 * O contador que **cai** é partida reiniciada, e não vibra.
 *
 * ```ts
 * const cues = createRumbleCues()
 * const effect = cues.since({ shot: session.lastShot, kills: local.kills })
 * if (effect) pad.vibrationActuator?.playEffect('dual-rumble', effect)
 * ```
 */
export function createRumbleCues(): RumbleCues {
  let killsBefore = 0
  return {
    since: (sample) => {
      const killed = sample.kills > killsBefore
      killsBefore = sample.kills
      if (killed) return RUMBLE_EFFECTS.kill
      if (!sample.shot) return undefined
      return sample.shot.targetIndex >= 0 ? RUMBLE_EFFECTS.hit : RUMBLE_EFFECTS.shot
    },
  }
}
