import type { CosmeticLoadoutMessage } from '@shobu/core'
import { playerSkinFor } from '../character/humanSkins.ts'
import { type ClassLoadout, classKitOf } from '../loadout/classLoadout.ts'
import type { NetworkPort } from '../net/networkPort.ts'

/**
 * A sala vista do menu: o fechamento, que o menu explica, o nome e o visual
 * que ela mostra, e quando o jogador pega o controle.
 */
export type MenuRoomPort = Pick<
  NetworkPort,
  'onRoomClosed' | 'chooseCallsign' | 'chooseCosmetics' | 'announceControl'
>

/**
 * O visual da classe como a sala o recebe: a skin do personagem e o **id** do
 * acabamento da sniper, e não o índice — o catálogo das snipers ainda muda, e
 * o id é o que dois clientes de versões diferentes ainda reconhecem.
 *
 * ```ts
 * cosmeticLoadoutOf(parseClassLoadout(null)) // { characterSkin: 'ronin', sniperFinish: 'preta' }
 * ```
 */
export function cosmeticLoadoutOf(loadout: ClassLoadout): CosmeticLoadoutMessage {
  const kit = classKitOf(loadout)
  return { characterSkin: playerSkinFor(kit.characterSkinId), sniperFinish: kit.sniperFinish.id }
}

/**
 * Manda à sala o visual da classe guardada. Vale no boot e a cada troca no
 * menu, como o nome (`announceMenuCallsign`): quem espera no menu de uma sala
 * já aparece para os outros com o corpo e o fuzil que escolheu. A porta
 * guarda o visual, o leva no pedido de entrada e o reenvia a cada sala.
 *
 * ```ts
 * announceMenuLook(room.network, choices.loadout.read())
 * ```
 */
export function announceMenuLook(
  port: Pick<NetworkPort, 'chooseCosmetics'>,
  loadout: ClassLoadout,
): void {
  port.chooseCosmetics(cosmeticLoadoutOf(loadout))
}
