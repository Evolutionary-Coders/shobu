import type { KickVotePort } from '../net/kickVotePort.ts'
import { type KickMenu, kickMenuRoomOf, kickRowRequest } from './kickMenu.ts'
import { type MenuState, withMenuKickRoom } from './mainMenuModel.ts'

/**
 * A linha EXPULSAR JOGADOR acompanhando a sala, a cada quadro com o menu na
 * tela: o estado e a tela só mudam quando a sala muda (`withMenuKickRoom`).
 *
 * ```ts
 * syncKickMenu(session, menu, network, config.match.kickVoteMinHumans)
 * ```
 */
export function syncKickMenu(
  session: { state: MenuState },
  menu: { setState(state: MenuState): void },
  network: Parameters<typeof kickMenuRoomOf>[0],
  minHumans: number,
): void {
  const next = withMenuKickRoom(session.state, kickMenuRoomOf(network, minHumans))
  if (next === session.state) return
  session.state = next
  menu.setState(next)
}

/**
 * Confirmar a linha (`kick` do menu): o voto escolhido, ou o pedido de abrir
 * o voto contra o jogador escolhido.
 *
 * ```ts
 * if (step.action === 'kick') sendKickRequest(network, step.state.kick)
 * ```
 */
export function sendKickRequest(
  network: Pick<KickVotePort, 'startKickVote' | 'castKickBallot'>,
  kick: KickMenu,
): void {
  const request = kickRowRequest(kick)
  if (request?.kind === 'start') network.startKickVote(request.targetId)
  if (request?.kind === 'ballot') network.castKickBallot(request.yes)
}
