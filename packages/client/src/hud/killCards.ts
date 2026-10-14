import type { KillWeapon } from '@shobu/core'
import {
  KILL_TAG_LABELS,
  KILL_WEAPON_LABELS,
  type KillCircumstances,
  type KillTag,
  killTagsOf,
} from './killTags.ts'

/**
 * Os dois cartões de abate, como dado: a tela de morte (quem matou o jogador,
 * e como) e o cartão de abate (quem o jogador matou). Quem desenha é o hud de
 * dom (`arenaHudDeathNotice.ts`, `arenaHudKillBanner.ts`) e o visor do óculos
 * (`headsetVisorModel.ts`), a partir do mesmo cartão.
 */
export interface KillCard {
  /** O nome do outro: quem matou, na tela de morte; quem morreu, no cartão de abate. */
  readonly name: string
  /** O retrato da skin dele (`portraitsOf`), ou `undefined` se a sala não o conhece. */
  readonly portraitUrl: string | undefined
  readonly weapon: KillWeapon
  readonly tags: readonly KillTag[]
  /** A distância do tiro ou do golpe, pronta: `87 M`. */
  readonly distance: string
}

/**
 * Quanto o cartão de abate fica na tela, da entrada à saída. Casado com
 * `killbanner-a`/`-b` em arenaKillBanner.css, e com o visor do óculos: 1,8 s
 * lê um nome e um retrato sem ficar no caminho do próximo alvo.
 */
export const KILL_BANNER_MS = 1_800

/** O que o cartão lê da kill: as circunstâncias e a distância (`KillNotice`). */
export type KillCardSource = KillCircumstances & { readonly distanceM: number }

/**
 * ```ts
 * killCardOf(session.deathCause, 'NEON KITSUNE', portraits.get('bot-0'))
 * // { name: 'NEON KITSUNE', weapon: 'sniper', tags: ['headshot', 'scoped'], distance: '87 M', ... }
 * ```
 */
export function killCardOf(
  kill: KillCardSource,
  name: string,
  portraitUrl: string | undefined,
): KillCard {
  return {
    name,
    portraitUrl,
    weapon: kill.weapon,
    tags: killTagsOf(kill),
    distance: distanceLabel(kill.distanceM),
  }
}

/**
 * Metro inteiro: décimo de metro num tiro de 87 m é ruído, e um golpe de
 * lâmina a 1,4 m vira `1 M`, que é o que ele foi — de perto.
 *
 * ```ts
 * distanceLabel(86.6) // '87 M'
 * ```
 */
export function distanceLabel(distanceM: number): string {
  return `${Math.round(Math.max(0, distanceM))} M`
}

/**
 * O cartão em palavras, para quem não vê os ícones: o `aria-label` do dom e a
 * linha de texto do visor do óculos, onde cada ícone também vira palavra.
 *
 * ```ts
 * killCardHowLabel(card) // 'SNIPER · NA CABEÇA · COM LUNETA · 87 M'
 * ```
 */
export function killCardHowLabel(card: KillCard): string {
  const tags = card.tags.map((tag) => KILL_TAG_LABELS[tag])
  return [KILL_WEAPON_LABELS[card.weapon], ...tags, card.distance].join(' · ')
}

/**
 * Quem a tela de morte nomeia: ninguém, com o tempo esgotado. `endMatch` não
 * apaga `killedBy` — quem morreu no último segundo continua morto na sessão —,
 * mas a tela de MVP é a única coisa que o visor mostra dali em diante.
 *
 * ```ts
 * deathScreenKillerOf({ killedBy: 'bot-1', matchOver: true }) // null
 * ```
 */
export function deathScreenKillerOf(session: {
  readonly killedBy: string | null
  readonly matchOver: boolean
}): string | null {
  return session.matchOver ? null : session.killedBy
}
