import type { KillWeapon } from '@shobu/core'

/**
 * Como a kill aconteceu, em marcas que o hud desenha como ícone: o killfeed,
 * a tela de morte e o cartão de abate leem a mesma lista.
 *
 * **No ar é de qualquer um dos dois.** O atirador no ar é a medalha `aereo`, a
 * vítima no ar é a `pombo`, e as duas cabem num ícone só: no killfeed o que se
 * lê de relance é "isto foi no ar", e quem quer saber quem estava voando tem a
 * medalha. Dois ícones de pulo na mesma linha seriam ruído.
 *
 * **Luneta e sem luneta são marcas de sniper.** A lâmina não tem luneta, e
 * marcar "sem luneta" numa facada diria uma coisa óbvia como se fosse façanha.
 */
export type KillTag = 'headshot' | 'scoped' | 'noscope' | 'airborne' | 'grapple'

/** O que a lista precisa saber da kill: um pedaço do `KillNotice` do quadro. */
export interface KillCircumstances {
  readonly weapon: KillWeapon
  readonly headshot: boolean
  readonly scoped: boolean
  readonly shooterAirborne: boolean
  readonly victimAirborne: boolean
  readonly shooterGrappling: boolean
}

/** O nome de cada marca, para o `<title>` do ícone e para quem lê a tela. */
export const KILL_TAG_LABELS: Readonly<Record<KillTag, string>> = {
  headshot: 'NA CABEÇA',
  scoped: 'COM LUNETA',
  noscope: 'SEM LUNETA',
  airborne: 'NO AR',
  grapple: 'NO GANCHO',
}

/** O nome de cada arma como o hud a escreve. */
export const KILL_WEAPON_LABELS: Readonly<Record<KillWeapon, string>> = {
  sniper: 'SNIPER',
  knife: 'FACA',
  katana: 'KATANA',
}

/**
 * As marcas da kill, na ordem em que a linha as desenha: a cabeça primeiro —
 * é a que mais pesa —, depois a mira, o ar e o gancho.
 *
 * Aloca uma lista curta: é chamada por kill, e não por quadro.
 *
 * ```ts
 * killTagsOf({ weapon: 'sniper', headshot: true, scoped: false, ... }) // ['headshot', 'noscope']
 * ```
 */
export function killTagsOf(kill: KillCircumstances): readonly KillTag[] {
  const tags: KillTag[] = []
  if (kill.headshot) tags.push('headshot')
  if (kill.weapon === 'sniper') tags.push(kill.scoped ? 'scoped' : 'noscope')
  if (kill.shooterAirborne || kill.victimAirborne) tags.push('airborne')
  if (kill.shooterGrappling) tags.push('grapple')
  return tags
}
