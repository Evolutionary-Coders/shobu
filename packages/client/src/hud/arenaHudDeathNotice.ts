import { type KillCard, killCardHowLabel } from './killCards.ts'
import { appendKillIcons } from './killIconDom.ts'
import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * A tela de morte: quem matou o jogador — o nome e o retrato da skin —, com o
 * quê e como (os mesmos ícones do killfeed) e de que distância, no centro do
 * visor enquanto ele espera o respawn. Sem killcam (GDD), mas sem morrer sem
 * saber de onde veio.
 *
 * **É o aviso de morte de sempre, crescido**, e não uma camada nova por cima:
 * o mesmo `data-death` liga e desliga, e a barra do respawn embaixo dele conta
 * o atraso pelo css (`--respawn-delay`), sem relógio. Some sozinho no respawn
 * — quem chama passa `null`.
 */
export interface DeathNotice {
  set(card: KillCard | null): void
}

/**
 * ```ts
 * const death = createDeathNotice(document, hudSection)
 * death.set(killCardOf(session.deathCause, 'NEON KITSUNE', portraitUrl))
 * ```
 */
export function createDeathNotice(root: ElementQuery, hud: HTMLElement): DeathNotice {
  const killer = requireElement<HTMLElement>(root, '.death-killer')
  const portrait = requireElement<HTMLImageElement>(root, '.death-portrait')
  const how = requireElement<HTMLElement>(root, '.death-how')
  const icons = requireElement<HTMLElement>(root, '.death-icons')
  const distance = requireElement<HTMLElement>(root, '.death-distance')
  return {
    set: (card) => {
      hud.dataset.death = card === null ? 'off' : 'on'
      if (card === null) return
      killer.textContent = card.name
      writePortrait(portrait, card.portraitUrl)
      icons.replaceChildren()
      appendKillIcons(icons, card.weapon, card.tags)
      distance.textContent = card.distance
      how.setAttribute('aria-label', killCardHowLabel(card))
    },
  }
}

/**
 * Só troca o `src` quando ele muda: reescrever o mesmo endereço reinicia o
 * carregamento, e o retrato piscaria a cada morte para o mesmo bot.
 */
export function writePortrait(portrait: HTMLImageElement, url: string | undefined): void {
  portrait.hidden = url === undefined
  if (url !== undefined && portrait.getAttribute('src') !== url) portrait.src = url
}
