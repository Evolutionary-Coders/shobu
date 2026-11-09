import {
  isHumanSkin,
  isPrimaryWeapon,
  isSniperFinishId,
  MELEE_WEAPONS,
  type MeleeWeapon,
  profileNameLabel,
} from '@shobu/core'
import type { RoomSimulation } from './roomSimulation.ts'

/**
 * O que o cliente diz de si e a sala guarda no assento: a lâmina, a arma
 * principal, o visual e o nome. Tudo vem da rede, então cada escolha só aceita o que é
 * do jogo, e quem não está na sala não muda nada.
 */

/**
 * A lâmina da classe que o cliente escolheu (`LOADOUT_MESSAGE`). Vem da rede,
 * então só uma lâmina do jogo é aceita; o resto é ignorado e fica a que estava.
 * Só a lâmina muda: zerar o resto do estado zeraria as recargas, e um cliente
 * adulterado mandaria a mensagem a cada golpe para golpear sem recarga.
 *
 * ```ts
 * chooseMelee(room, client.sessionId, message.meleeWeapon)
 * ```
 */
export function chooseMelee(room: RoomSimulation, playerId: string, weapon: unknown): void {
  const seat = room.seats.get(playerId)
  if (!seat || !MELEE_WEAPONS.includes(weapon as MeleeWeapon)) return
  seat.arsenal.melee.weapon = weapon as MeleeWeapon
}

/**
 * A arma principal que o cliente escolheu (`PRIMARY_LOADOUT_MESSAGE`). Vem da
 * rede, então só uma arma do jogo é aceita; o resto é ignorado e fica a que
 * estava. Só o campo muda: as duas snipers jogam igual, e zerar o estado da
 * arma daria recarga de graça a quem reenviasse a mensagem.
 *
 * ```ts
 * choosePrimary(room, client.sessionId, message.primaryWeapon)
 * ```
 */
export function choosePrimary(room: RoomSimulation, playerId: string, weapon: unknown): void {
  const seat = room.seats.get(playerId)
  if (!seat || !isPrimaryWeapon(weapon)) return
  seat.primaryWeapon = weapon
}

/**
 * O nome de perfil que o cliente mandou (`CALLSIGN_MESSAGE`). Vem da rede e
 * vai para os outros clientes: passa pela mesma limpeza do menu, e o que não
 * é nome vira o padrão.
 *
 * ```ts
 * nameSeat(room, client.sessionId, message.callsign)
 * ```
 */
export function nameSeat(room: RoomSimulation, playerId: string, callsign: unknown): void {
  const seat = room.seats.get(playerId)
  if (seat) seat.callsign = profileNameLabel(callsign)
}

/**
 * A skin do personagem e o acabamento da sniper que o cliente escolheu
 * (`COSMETIC_LOADOUT_MESSAGE`, ou as opções da entrada). Vêm da rede e vão
 * para a tela de todos: cada campo é conferido sozinho, e o que não vale é
 * ignorado e fica o que estava — uma skin errada não apaga o acabamento certo.
 *
 * ```ts
 * chooseCosmetics(room, client.sessionId, message.characterSkin, message.sniperFinish)
 * ```
 */
export function chooseCosmetics(
  room: RoomSimulation,
  playerId: string,
  skin: unknown,
  finish: unknown,
): void {
  const seat = room.seats.get(playerId)
  if (!seat) return
  if (isHumanSkin(skin)) seat.characterSkin = skin
  if (isSniperFinishId(finish)) seat.sniperFinish = finish
}
