import type { WeaponPhase } from '@shobu/core'
import {
  DEFAULT_PROFILE_NAME,
  PROFILE_NAME_MAX,
  profileNameLabel,
} from '../settings/profileName.ts'

/**
 * Os campos de texto do hud da arena: o que cada mostrador escreve, antes de
 * virar glifo ou texto técnico. Dado puro; quem escreve no dom são os
 * `arenaHud*.ts`.
 */

/**
 * O que a arma está fazendo, numa palavra.
 *
 * ```ts
 * weaponStatus(4, 'cycling') // 'FERROLHO'
 * ```
 */
export function weaponStatus(loaded: number, phase: WeaponPhase): string {
  if (phase === 'reloading') return 'RECARREGANDO'
  if (phase === 'cycling' || phase === 'firing') return 'FERROLHO'
  if (loaded === 0) return 'VAZIA'
  return 'PRONTA'
}

/**
 * A designação técnica da arma, no canto dela. Uma só porque o jogo tem uma
 * arma só; o número de série é da casa, e não de fabricante nenhum.
 */
export const WEAPON_DESIGNATION = 'SNIPER · SHB-96'

export interface AmmoLabels {
  /** As balas no pente, o número grande. */
  readonly loaded: string
  /** O tamanho do pente, menor, logo depois: `/5`. */
  readonly magazine: string
}

/**
 * ```ts
 * ammoLabels(3, 5) // { loaded: '3', magazine: '/5' }
 * ```
 */
export function ammoLabels(loaded: number, magazineRounds: number): AmmoLabels {
  return { loaded: `${loaded}`, magazine: `/${magazineRounds}` }
}

/** O nome no alto do estado quando o jogador não escolheu um (`profileName.ts`). */
export const DEFAULT_CALLSIGN = DEFAULT_PROFILE_NAME

/** O mesmo teto do killfeed: acima disto o nome empurra o relógio para fora da coluna. */
export const CALLSIGN_MAX = PROFILE_NAME_MAX

/**
 * O nome do jogador como o estado o mostra: o nome de perfil limpo, ou o
 * padrão, **sem acento**. O estado é desenhado na folha de glifos da MG
 * Rising, que só tem ASCII: o "Ã" de JOÃO sairia como um buraco, e "JOAO" se
 * lê. O placar, o killfeed e as telas de abate são texto, e mantêm o acento.
 *
 * ```ts
 * callsignLabel(undefined) // 'AGENTE'
 * callsignLabel(' joão ')  // 'JOAO'
 * ```
 */
export function callsignLabel(name: string | undefined): string {
  return profileNameLabel(name).normalize('NFD').replace(/\p{M}/gu, '')
}

/** Sete dígitos, como o `BP` do Metal Gear Rising: a linha não muda de largura na partida. */
export const POINTS_DIGITS = 7

const POINTS_CEILING = 10 ** POINTS_DIGITS - 1

/**
 * Os pontos do jogador local, com zeros à esquerda.
 *
 * ```ts
 * pointsLabel(400) // 'PTS: 0000400'
 * ```
 *
 * @throws RangeError pontos que não são inteiro >= 0
 */
export function pointsLabel(points: number): string {
  if (!Number.isInteger(points) || points < 0) {
    throw new RangeError(`points recebeu ${points}; esperado inteiro >= 0`)
  }
  const shown = Math.min(points, POINTS_CEILING)
  return `PTS: ${`${shown}`.padStart(POINTS_DIGITS, '0')}`
}

export interface SignedPoints {
  readonly sign: '+' | '-'
  readonly digits: string
}

/**
 * Os pontos de uma kill, com o sinal separado do número.
 *
 * Separado porque a folha de glifos não tem `+` nem `-`: o número é desenhado
 * nela, e o sinal vai em texto. O sinal faz parte da leitura, e o formato já
 * aceita desconto no dia em que houver um.
 *
 * ```ts
 * killPointsParts(100) // { sign: '+', digits: '100' }
 * ```
 */
export function killPointsParts(points: number): SignedPoints {
  return { sign: points >= 0 ? '+' : '-', digits: `${Math.abs(points)}` }
}
