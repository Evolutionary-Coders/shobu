import { followFraction } from './frameDecay.ts'

/**
 * O coice do disparo: a arma recua, a mira sobe e a câmera treme.
 *
 * **A subida é de verdade, não enfeite**: o tiro levanta a mira e só devolve
 * parte dela, então quem atira em sequência tem que corrigir para baixo. É
 * render, não simulação — o tiro já foi resolvido no tick em que saiu, e o
 * coice mexe em onde o jogador vai mirar **depois**, que é exatamente o custo
 * que um ferrolho deve ter.
 *
 * O tremor é separado da subida e some sozinho: é o que o jogador sente, e a
 * subida é o que ele tem que consertar.
 *
 * O **recuo da arma** é a terceira parte, e mora aqui porque é o mesmo evento:
 * a arma vem para trás, na direção do ombro, e o cano levanta. Ao contrário das
 * outras duas, ele **sobrevive a "menos movimento"** — mexer numa arma a 65 cm
 * do olho não é o gatilho vestibular que mexer na câmera é, e é a confirmação
 * mais direta de que o tiro saiu.
 */

/**
 * Quanto a mira sobe num tiro.
 *
 * 9° é sniper de ferrolho: o cano vai para o teto e o jogador **perde o alvo
 * de vista**. É caro de propósito — a arma mata com um tiro, e o preço de
 * errar tem que ser sentido no braço, não só no cronômetro do ferrolho.
 */
const KICK_RAD = (9 * Math.PI) / 180

/** A subida inteira em 50 ms: o coice é um soco, não um empurrão. */
const RISE_PER_S = KICK_RAD / 0.05

/** Quanto da subida volta sozinha. O resto fica, e é o que o jogador corrige. */
const RECOVERY_FRACTION = 0.82

/** A volta leva 400 ms, bem mais devagar que a subida — sobe de estalo e assenta. */
const RECOVER_PER_S = (KICK_RAD * RECOVERY_FRACTION) / 0.4

/**
 * O tremor bate umas doze vezes por segundo e some em pouco mais de meio
 * segundo.
 *
 * Muito menor que a subida, e de propósito: **quem conta a história do coice é
 * o cano subindo**, não a tela vibrando. Tremor grande em cima de uma subida
 * de 9° vira enjoo, e a rolagem é a pior das duas — o horizonte torto é o que
 * o olho menos perdoa. Daí ela ser quase simbólica.
 */
const SHAKE_HZ = 12
const SHAKE_DECAY_PER_S = 5
const SHAKE_PITCH_RAD = (0.5 * Math.PI) / 180
const SHAKE_ROLL_RAD = (0.1 * Math.PI) / 180

/**
 * Quanto a arma recua, em metros.
 *
 * Recuo é movimento em **profundidade**, e profundidade quase não se lê: 7,5 cm
 * num rig de 65 cm mudam o tamanho aparente em 13 %, e nada mais. Sozinho, o
 * olho registra "a arma ficou maior", não "a arma voltou".
 */
const PUNCH_BACK_M = 0.075

/**
 * Quanto a arma sobe no recuo, em metros.
 *
 * **É esta parte que faz o recuo ser visto.** Ela desloca a arma 42 px na tela,
 * enquanto os 7,5 cm de profundidade não deslocam nenhum. Somadas, as duas dão
 * o gesto de a arma subir e entrar no ombro, que é o que a mão espera.
 */
const PUNCH_UP_M = 0.022

/** Quanto o cano levanta no recuo. Negativo é para cima, na convenção do rig. */
const PUNCH_PITCH_RAD = (-4 * Math.PI) / 180

/**
 * O recuo some em uns 150 ms, bem mais rápido que o ciclo do ferrolho: a arma
 * volta ao lugar e **depois** o ferrolho trabalha, que é a ordem de um tiro de
 * verdade.
 */
const PUNCH_DECAY_PER_S = 14

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
  /** Envelope do recuo da arma, de 1 a 0. Não depende de `enabled`. */
  punch: number
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
  return {
    riseLeftRad: 0,
    recoverLeftRad: 0,
    shake: 0,
    shakePhase: 0,
    lastWobbleRad: 0,
    punch: 0,
    enabled,
  }
}

/** Um tiro. Coices somam: dois tiros seguidos levantam mais que um. */
export function kickRecoil(recoil: WeaponRecoil): void {
  // o recuo da arma vem antes da guarda: ele vale mesmo com menos movimento.
  recoil.punch = 1
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
  recoil.punch -= recoil.punch * followFraction(dtS, PUNCH_DECAY_PER_S)
  const wobble = Math.sin(recoil.shakePhase) * SHAKE_PITCH_RAD * recoil.shake
  out.pitchDeltaRad = back - rise + (wobble - recoil.lastWobbleRad)
  out.rollRad = Math.cos(recoil.shakePhase * 0.7) * SHAKE_ROLL_RAD * recoil.shake
  recoil.lastWobbleRad = wobble
  return out
}

function advanceShake(recoil: WeaponRecoil, dtS: number): void {
  if (recoil.shake <= 0) return
  recoil.shakePhase = (recoil.shakePhase + dtS * SHAKE_HZ * TWO_PI) % TWO_PI
  recoil.shake -= recoil.shake * followFraction(dtS, SHAKE_DECAY_PER_S)
}

/**
 * Quanto a arma está recuada neste quadro, em metros. Somar ao **z** do rig com
 * sinal negativo: o cano aponta para +z, então recuar é vir para trás.
 *
 * ```ts
 * rig.position.z = placement.offsetM[2] - weaponPunchBackM(recoil)
 * ```
 */
export function weaponPunchBackM(recoil: Readonly<WeaponRecoil>): number {
  return recoil.punch * PUNCH_BACK_M
}

/** Quanto a arma está levantada neste quadro, em metros. Somar ao **y** do rig. */
export function weaponPunchUpM(recoil: Readonly<WeaponRecoil>): number {
  return recoil.punch * PUNCH_UP_M
}

/** Quanto o cano está levantado neste quadro. Negativo é para cima. */
export function weaponPunchPitchRad(recoil: Readonly<WeaponRecoil>): number {
  return recoil.punch * PUNCH_PITCH_RAD
}

/** Quanto da subida de um tiro fica para o jogador corrigir. */
export function residualKickRad(): number {
  return KICK_RAD * (1 - RECOVERY_FRACTION)
}
