import type { MenuAction } from './mainMenuModel.ts'

/**
 * De onde veio o comando do menu. O mouse entra pelo teclado: os dois travam o
 * ponteiro. O toque é o dedo na tela do celular.
 */
export type MenuSource = 'keyboard' | 'gamepad' | 'touch'

/**
 * Como o jogador entra na arena: pelo óculos, pelo controle ou com o ponteiro
 * travado.
 */
export type ArenaEntry = 'headset' | 'gamepad' | 'touch' | 'pointer'

/**
 * O óculos é escolha explícita do item VR EXPERIMENTAL. Fora dele, quem
 * confirmou pelo controle joga pelo controle: o navegador não trava o
 * ponteiro num aperto de gamepad (`unlockedSession.ts`), e pedir um clique de
 * mouse a quem está de controle na mão é o que este módulo evita. Quem tocou
 * com o dedo joga pelo toque: o chrome do android não trava ponteiro nenhum.
 *
 * ```ts
 * arenaEntryFor('deploy', 'gamepad') // 'gamepad'
 * ```
 */
/**
 * De onde veio o clique numa linha do menu. O `pointerType` decide quando o
 * navegador o entrega — o chrome entrega o clique como `PointerEvent`. Quando
 * não entrega (`undefined`: o clique ainda é `MouseEvent`, como em safari
 * antigo de iphone), o ponteiro **grosso** decide: tocar em ENTRAR num celular
 * e cair na trava de ponteiro, que o iphone nem tem, era jogo que não abria
 * (revisão do PR #21).
 *
 * ```ts
 * menuSourceOfClick(undefined, true) // 'touch'
 * ```
 */
export function menuSourceOfClick(
  pointerType: string | undefined,
  coarsePointer: boolean,
): MenuSource {
  if (pointerType === undefined) return coarsePointer ? 'touch' : 'keyboard'
  return pointerType === 'touch' ? 'touch' : 'keyboard'
}

export function arenaEntryFor(action: MenuAction, source: MenuSource): ArenaEntry {
  if (action === 'deploy-headset') return 'headset'
  return source === 'keyboard' ? 'pointer' : source
}
