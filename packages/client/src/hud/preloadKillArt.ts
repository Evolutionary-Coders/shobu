import { MEDAL_CATALOG, SCORESTREAK_CATALOG } from '@shobu/core'
import { HUMAN_SKINS, humanPortraitUrl } from '../character/humanSkins.ts'
import { scorestreakIconUrl } from '../loadout/scorestreakCards.ts'
import { medalIconUrl } from './medalFeed.ts'

/**
 * Os dezessete ícones de medalha, as doze miniaturas de série e os quatro
 * retratos, **depois** que o jogador ganhou o controle: ~210 kB que não podem
 * disputar os cinco segundos do pilar 2, e que também não podem esperar a
 * primeira kill ou a primeira série — buscá-los no toast, no slot do hud, na
 * tela de morte ou no cartão de abate deixaria o primeiro como um retângulo
 * vazio, e decodificá-los ali seria um quadro longo no meio do tiroteio. Uma
 * vez só, no primeiro controle.
 *
 * ```ts
 * preloadKillArt(renderer, decodeAhead)
 * ```
 */
export function preloadKillArt(
  renderer: { onPlayerControlChange(listener: (inControl: boolean) => void): void },
  decode: (url: string) => void,
): void {
  let loaded = false
  renderer.onPlayerControlChange((inControl) => {
    if (!inControl || loaded) return
    loaded = true
    for (const url of killArtUrls()) decode(url)
  })
}

function killArtUrls(): string[] {
  return [
    ...MEDAL_CATALOG.map((medal) => medalIconUrl(medal.slug)),
    ...HUMAN_SKINS.map((skin) => humanPortraitUrl(skin.id)),
    ...SCORESTREAK_CATALOG.map((streak) => scorestreakIconUrl(streak.slug)),
  ]
}
