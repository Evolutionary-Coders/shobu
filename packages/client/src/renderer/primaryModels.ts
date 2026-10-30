import { PRIMARY_WEAPONS, type PrimaryWeapon } from '@shobu/core'

/**
 * Os modelos de cada arma principal (ADR 0030): as duas snipers jogam igual e
 * só mudam o glb. Servidos de `public/`, baixados sob demanda.
 *
 * A laser divide com a clássica o rig, os nomes dos nós, a pele de 50 juntas
 * e o `allanims` (`loadSniperViewmodel.ts`); o rifle de terceira pessoa dela
 * segue as convenções do `bot-rifle.glb` (`botRifle.ts`).
 */
export const VIEWMODEL_URLS: Readonly<Record<PrimaryWeapon, string>> = {
  laser: '/assets/viewmodel/sniper-laser.glb',
  classic: '/assets/viewmodel/sniper.glb',
}

/** O rifle na mão de quem é visto de fora, um por arma principal. */
export const BOT_RIFLE_URLS: Readonly<Record<PrimaryWeapon, string>> = {
  laser: '/assets/character/bot-laser-rifle.glb',
  classic: '/assets/character/bot-rifle.glb',
}

/**
 * A arma que aparece na mão: a escolhida, se já chegou; senão qualquer uma
 * que já chegou, para a mão não ficar vazia enquanto a nova baixa; e
 * `undefined` antes de qualquer glb.
 *
 * ```ts
 * shownPrimary('classic', new Set(['laser'])) // 'laser', até a clássica chegar
 * ```
 */
export function shownPrimary(
  chosen: PrimaryWeapon,
  loaded: ReadonlySet<PrimaryWeapon>,
): PrimaryWeapon | undefined {
  if (loaded.has(chosen)) return chosen
  return PRIMARY_WEAPONS.find((weapon) => loaded.has(weapon))
}
