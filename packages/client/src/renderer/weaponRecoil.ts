/**
 * O coice do disparo: a mira sobe e a câmera treme.
 *
 * **A subida é de verdade, não enfeite**: o tiro levanta a mira e só devolve
 * parte dela, então quem atira em sequência tem que corrigir para baixo. É
 * render, não simulação — o tiro já foi resolvido no tick em que saiu, e o
 * coice mexe em onde o jogador vai mirar **depois**, que é exatamente o custo
 * que um ferrolho deve ter.
 *
 * O tremor é separado da subida e some sozinho: é o que o jogador sente, e a
 * subida é o que ele tem que consertar.
 */

/** Quanto a mira sobe num tiro. 3° é sniper: sente, e não cega. */
const KICK_RAD = (3 * Math.PI) / 180

/** A subida inteira em 45 ms: o coice é um soco, não um empurrão. */
const RISE_PER_S = KICK_RAD / 0.045

/** Quanto da subida volta sozinha. O resto fica, e é o que o jogador corrige. */
const RECOVERY_FRACTION = 0.8

/** A volta leva uns 350 ms, bem mais devagar que a subida. */
const RECOVER_PER_S = (KICK_RAD * RECOVERY_FRACTION) / 0.35

/** O tremor bate umas dez vezes por segundo e some em pouco mais de meio segundo. */
const SHAKE_HZ = 11
const SHAKE_DECAY_PER_S = 6
const SHAKE_PITCH_RAD = (0.45 * Math.PI) / 180
const SHAKE_ROLL_RAD = (0.8 * Math.PI) / 180

const TWO_PI = Math.PI * 2

export interface WeaponRecoil {
  /** Quanto da subida ainda falta aplicar. */
  riseLeftRad: number
  /** Quanto da subida ainda volta. */
  recoverLeftRad: number
  /** Intensidade do tremor, de 0 a 1, decaindo. */
  shake: number
  shakePhase: number
  /** O tremor de inclinação já aplicado, para o próximo quadro aplicar só a diferença. */
  lastWobbleRad: number
  /** Falso para quem pediu menos movimento: tremor de câmera é gatilho vestibular. */
  readonly enabled: boolean
}

export interface RecoilOffset {
  /**
   * Quanto **somar** à inclinação da câmera neste quadro. Negativo sobe, na
   * convenção do babylon. É diferença e não valor absoluto porque a inclinação
   * também é a mira do jogador, e o mouse escreve nela o tempo todo.
   */
  pitchDeltaRad: number
  /** Rolagem da câmera, em valor absoluto: ninguém mais escreve nela. */
  rollRad: number
}

export function createWeaponRecoil(enabled: boolean): WeaponRecoil {
  return { riseLeftRad: 0, recoverLeftRad: 0, shake: 0, shakePhase: 0, lastWobbleRad: 0, enabled }
}

/** Um tiro. Coices somam: dois tiros seguidos levantam mais que um. */
export function kickRecoil(recoil: WeaponRecoil): void {
  if (!recoil.enabled) return
  recoil.riseLeftRad += KICK_RAD
  recoil.recoverLeftRad += KICK_RAD * RECOVERY_FRACTION
  recoil.shake = 1
  recoil.shakePhase = 0
}

/**
 * ```ts
 * advanceRecoil(recoil, dtS, offset)
 * camera.rotation.x += offset.pitchDeltaRad
 * camera.rotation.z = offset.rollRad
 * ```
 */
export function advanceRecoil(recoil: WeaponRecoil, dtS: number, out: RecoilOffset): RecoilOffset {
  if (!Number.isFinite(dtS) || dtS < 0) {
    throw new RangeError(`dtS recebeu ${dtS}; esperado tempo de quadro finito >= 0`)
  }
  const rise = Math.min(recoil.riseLeftRad, RISE_PER_S * dtS)
  recoil.riseLeftRad -= rise
  // a volta só começa depois de a subida terminar: as duas ao mesmo tempo
  // comeriam uma à outra e o coice sumiria.
  const back = recoil.riseLeftRad > 0 ? 0 : Math.min(recoil.recoverLeftRad, RECOVER_PER_S * dtS)
  recoil.recoverLeftRad -= back
  advanceShake(recoil, dtS)
  const wobble = Math.sin(recoil.shakePhase) * SHAKE_PITCH_RAD * recoil.shake
  out.pitchDeltaRad = back - rise + (wobble - recoil.lastWobbleRad)
  out.rollRad = Math.cos(recoil.shakePhase * 0.7) * SHAKE_ROLL_RAD * recoil.shake
  recoil.lastWobbleRad = wobble
  return out
}

function advanceShake(recoil: WeaponRecoil, dtS: number): void {
  if (recoil.shake <= 0) return
  recoil.shakePhase = (recoil.shakePhase + dtS * SHAKE_HZ * TWO_PI) % TWO_PI
  recoil.shake -= recoil.shake * Math.min(1, dtS * SHAKE_DECAY_PER_S)
}

/** Quanto da subida de um tiro fica para o jogador corrigir. */
export function residualKickRad(): number {
  return KICK_RAD * (1 - RECOVERY_FRACTION)
}
