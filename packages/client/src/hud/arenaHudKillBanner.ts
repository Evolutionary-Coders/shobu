import { writePortrait } from './arenaHudDeathNotice.ts'
import { type KillCard, killCardHowLabel } from './killCards.ts'
import { appendKillIcons } from './killIconDom.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * O cartão de abate: o nome de quem o jogador acabou de matar, num retângulo
 * de emblema embaixo, no centro — o calling card do Call of Duty —, com o
 * retrato da skin, a arma e as marcas da kill. Entra e sai sozinho pelo css
 * (`KILL_BANNER_MS`), sem relógio.
 *
 * **Abate seguido troca o cartão**, e não empilha: o nó é o mesmo, e alternar
 * `data-pop` entre `a` e `b` reinicia a animação — o mesmo truque do registro
 * da retícula. Dois cartões empilhados embaixo do centro cobririam a mira de
 * quem está no meio de uma sequência.
 */
export interface KillBanner {
  show(card: KillCard): void
}

/**
 * ```ts
 * const banner = createKillBanner(document)
 * banner.show(killCardOf(notice, 'HEXKILL', portraitUrl))
 * ```
 */
export function createKillBanner(root: ElementQuery): KillBanner {
  const banner = requireElement<HTMLElement>(root, '#hud-killbanner')
  const name = requireElement<HTMLElement>(root, '.killbanner-name')
  const portrait = requireElement<HTMLImageElement>(root, '.killbanner-portrait')
  const how = requireElement<HTMLElement>(root, '.killbanner-how')
  const icons = requireElement<HTMLElement>(root, '.killbanner-icons')
  const distance = requireElement<HTMLElement>(root, '.killbanner-distance')
  const state = { toggle: 'a' }
  return {
    show: (card) => {
      name.textContent = card.name
      writePortrait(portrait, card.portraitUrl)
      icons.replaceChildren()
      appendKillIcons(icons, card.weapon, card.tags)
      distance.textContent = card.distance
      how.setAttribute('aria-label', killCardHowLabel(card))
      state.toggle = state.toggle === 'a' ? 'b' : 'a'
      banner.dataset.pop = state.toggle
    },
  }
}
