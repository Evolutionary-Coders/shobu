import type { KickVotePort } from '../net/kickVotePort.ts'

/**
 * A linha EXPULSAR JOGADOR da raiz do menu (ADR 0034), como estado puro. É o
 * caminho de todo método de entrada — toque, controle, teclado — para abrir
 * o voto e, com o voto aberto, para votar pelo controle, que tem o d-pad
 * inteiro ocupado na arena. Uma linha só, e não uma tela: as setas laterais
 * escolhem o jogador (ou SIM e NÃO), e confirmar pede. Some sem outro humano
 * na sala e sem voto em que este jogador vote.
 */

/** Um humano da sala que não é este jogador: o id da sala e o nome. */
export interface KickMenuTarget {
  readonly id: string
  readonly name: string
}

/** O que a sala diz agora, lido da rede a cada quadro com o menu na tela. */
export interface KickMenuRoom {
  readonly targets: readonly KickMenuTarget[]
  /** O nome do alvo do voto aberto em que este jogador ainda vota; `undefined` sem ele. */
  readonly ballotFor: string | undefined
  /** Por que pedir não abriria voto, quando já se sabe (`kickBlockedReason`). */
  readonly blocked: string | undefined
}

export interface KickMenu extends KickMenuRoom {
  /** O jogador escolhido entre os alvos. */
  readonly targetIndex: number
  /** O voto escolhido na linha do voto aberto. */
  readonly ballotYes: boolean
}

/** O que confirmar a linha pede à sala. */
export type KickMenuRequest =
  | { readonly kind: 'start'; readonly targetId: string }
  | { readonly kind: 'ballot'; readonly yes: boolean }

export const NO_KICK_MENU: KickMenu = {
  targets: [],
  ballotFor: undefined,
  blocked: undefined,
  targetIndex: 0,
  ballotYes: true,
}

/**
 * A sala de agora na linha, com a escolha mantida no mesmo jogador quando
 * ele continua na sala. O mesmo objeto volta quando nada mudou, para o menu
 * não ser reescrito a cada quadro.
 *
 * ```ts
 * withKickRoom(NO_KICK_MENU, { targets: [{ id: 'x', name: 'RAIDEN' }], ballotFor: undefined, blocked: undefined })
 * ```
 */
export function withKickRoom(kick: KickMenu, room: KickMenuRoom): KickMenu {
  if (sameRoom(kick, room)) return kick
  const chosen = kick.targets[kick.targetIndex]?.id
  const kept = room.targets.findIndex((target) => target.id === chosen)
  return { ...kick, ...room, targetIndex: Math.max(0, kept) }
}

function sameRoom(kick: KickMenu, room: KickMenuRoom): boolean {
  if (kick.ballotFor !== room.ballotFor || kick.blocked !== room.blocked) return false
  if (kick.targets.length !== room.targets.length) return false
  return kick.targets.every(
    (target, index) =>
      target.id === room.targets[index]?.id && target.name === room.targets[index]?.name,
  )
}

/**
 * Se a linha aparece: há outro humano na sala, ou um voto em que este jogador vota.
 *
 * ```ts
 * kickRowShown(NO_KICK_MENU) // false
 * ```
 */
export function kickRowShown(kick: KickMenu): boolean {
  return kick.targets.length > 0 || kick.ballotFor !== undefined
}

/** A linha como o menu a escreve: o rótulo, o valor entre as setas e a nota. */
export interface KickRowParts {
  readonly label: string
  readonly value: string
  /** Por que não dá, quando já se sabe; `undefined` sem nota. */
  readonly note: string | undefined
}

/**
 * O texto da linha. Com o voto aberto, ela é o voto, e o valor é SIM ou NÃO;
 * fora dele, o valor é o jogador escolhido, e a nota diz se já se sabe que
 * não dá.
 *
 * ```ts
 * kickRowParts({ ...NO_KICK_MENU, targets: [{ id: 'x', name: 'RAIDEN' }] })
 * // { label: 'EXPULSAR', value: 'RAIDEN', note: undefined }
 * ```
 */
export function kickRowParts(kick: KickMenu): KickRowParts {
  if (kick.ballotFor !== undefined) {
    const value = kick.ballotYes ? 'SIM' : 'NÃO'
    return { label: `EXPULSAR ${kick.ballotFor}?`, value, note: undefined }
  }
  const value = kick.targets[kick.targetIndex]?.name ?? ''
  return { label: 'EXPULSAR', value, note: kick.blocked }
}

/**
 * A seta lateral: troca o voto, ou o jogador, dando a volta — são poucos, e
 * a volta é o jeito de chegar ao outro lado com uma seta só.
 *
 * ```ts
 * stepKickRow(kick, 'right').targetIndex // o próximo jogador
 * ```
 */
export function stepKickRow(kick: KickMenu, command: 'left' | 'right'): KickMenu {
  if (kick.ballotFor !== undefined) return { ...kick, ballotYes: !kick.ballotYes }
  const count = kick.targets.length
  if (count === 0) return kick
  const step = command === 'right' ? 1 : -1
  return { ...kick, targetIndex: (kick.targetIndex + step + count) % count }
}

/**
 * O que confirmar pede: o voto escolhido, ou abrir o voto contra o jogador
 * escolhido. `undefined` quando já se sabe que não dá: a linha diz por quê.
 *
 * ```ts
 * kickRowRequest(kick) // { kind: 'start', targetId: 'x' }
 * ```
 */
export function kickRowRequest(kick: KickMenu): KickMenuRequest | undefined {
  if (kick.ballotFor !== undefined) return { kind: 'ballot', yes: kick.ballotYes }
  const target = kick.targets[kick.targetIndex]
  if (!target || kick.blocked !== undefined) return undefined
  return { kind: 'start', targetId: target.id }
}

/**
 * Por que pedir não abriria voto, do que a página já sabe: na sala privada,
 * só o anfitrião expulsa; na pública, faltam humanos. O resto — recarga,
 * proteção, voto aberto — só a sala sabe, e a recusa dela vira nota.
 *
 * ```ts
 * kickBlockedReason({ humans: 2, hostId: undefined, ownId: 'eu', minHumans: 3 }) // 'PRECISA DE 3 JOGADORES'
 * ```
 */
export function kickBlockedReason(room: {
  readonly humans: number
  readonly hostId: string | undefined
  readonly ownId: string | undefined
  readonly minHumans: number
}): string | undefined {
  if (room.hostId !== undefined) return room.hostId === room.ownId ? undefined : 'SÓ O ANFITRIÃO'
  return room.humans < room.minHumans ? `PRECISA DE ${room.minHumans} JOGADORES` : undefined
}

/**
 * A sala de agora para a linha, lida da porta de rede: os alvos, o voto em
 * que este jogador ainda vota, e o que já se sabe que barra o pedido.
 *
 * ```ts
 * withKickRoom(state.kick, kickMenuRoomOf(network, config.match.kickVoteMinHumans))
 * ```
 */
export function kickMenuRoomOf(
  network: Pick<KickVotePort, 'kickTargets' | 'kickVote' | 'hostId'> & {
    readonly ownId: string | undefined
  },
  minHumans: number,
): KickMenuRoom {
  const targets = network.kickTargets()
  const vote = network.kickVote()
  const ballotFor = vote?.isEligible && vote.ownBallot === undefined ? vote.targetName : undefined
  const { ownId } = network
  const hostId = network.hostId()
  return {
    targets,
    ballotFor,
    blocked: kickBlockedReason({ humans: targets.length + 1, hostId, ownId, minHumans }),
  }
}
