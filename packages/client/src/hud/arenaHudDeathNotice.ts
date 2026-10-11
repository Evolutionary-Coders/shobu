import { type ElementQuery, requireElement } from './requireElement.ts'

/**
 * Quem matou o jogador, no centro do visor, enquanto ele espera o respawn. É o
 * retorno simples que a morte pede: sem killcam (GDD), mas sem morrer sem
 * saber de onde veio. Some sozinho no respawn — quem chama passa `null`.
 */
export interface DeathNotice {
  set(killer: string | null): void
}

/**
 * ```ts
 * const death = createDeathNotice(document, hudSection)
 * death.set('ONRYO')
 * ```
 */
export function createDeathNotice(root: ElementQuery, hud: HTMLElement): DeathNotice {
  const killer = requireElement<HTMLElement>(root, '.death-killer')
  return {
    set: (name) => {
      hud.dataset.death = name === null ? 'off' : 'on'
      if (name !== null) killer.textContent = name
    },
  }
}
