import type { PrimaryWeapon, WeaponPhase } from '@shobu/core'
import { DEFAULT_PROFILE_NAME, PROFILE_NAME_MAX, profileNameLabel } from '@shobu/core'

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
 * A designação técnica de cada arma principal, no canto dela: o nome do menu
 * (`PRIMARY_LABELS`) partido em família e série pelo ponto do visor. Os nomes
 * são escolha do usuário (HANABI em 29/10; NA-AWM, a antiga SHB-96, no mesmo
 * dia). Até a laser, era uma constante só, e o hud dizia SHB-96 com a laser na mão.
 */
const WEAPON_DESIGNATIONS: Readonly<Record<PrimaryWeapon, string>> = {
  laser: 'HANABI · LX-01',
  classic: 'NA · AWM',
}

/**
 * ```ts
 * weaponDesignation('laser') // 'HANABI · LX-01'
 * ```
 */
export function weaponDesignation(weapon: PrimaryWeapon): string {
  return WEAPON_DESIGNATIONS[weapon]
}

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

/**
 * Cinco dígitos: a linha não muda de largura na partida, como o `BP` do Metal
 * Gear Rising, mas os sete dele ("PTS: 0000000") liam como uma fileira de
 * caixas, com os zeros cortados da folha de glifos. O limite padrão é 3000
 * pontos e o teto da configuração 100000: cinco cobrem a partida inteira.
 */
export const POINTS_DIGITS = 5

const POINTS_CEILING = 10 ** POINTS_DIGITS - 1

/**
 * Os pontos do jogador local, com zeros à esquerda.
 *
 * ```ts
 * pointsLabel(400) // 'PTS: 00400'
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
