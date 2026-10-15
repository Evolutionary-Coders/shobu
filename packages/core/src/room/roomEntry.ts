/**
 * O matchmaking pela URL, no fio: o cliente pede a entrada pelo endereço numa
 * rota HTTP do servidor de jogo, e recebe o assento reservado na sala em que
 * vai jogar. Com a sala pedida cheia, essa é a sala provisória, e o servidor
 * manda outro assento, na sala pedida, quando a vaga abre (CONTEXT.md, "Fila
 * da sala").
 */
export const ROOM_ENTRY_PATH = '/rooms/enter'

/**
 * Quanto um assento reservado espera o jogador chegar, o padrão do colyseus,
 * fixado porque o matchmaking confere a fila de novo quando ele vence, e o
 * cliente que recarrega a página carrega a reserva só enquanto ela vale.
 */
export const SEAT_RESERVATION_S = 15

/** Do servidor para quem está na fila: a vaga abriu, e o assento já está reservado. */
export const ROOM_MOVE_MESSAGE = 'room.move'

/**
 * Um assento reservado e o endereço da sala dele, que é o que a URL passa a
 * mostrar. A reserva é a do colyseus; o núcleo não a conhece por dentro.
 */
export interface SeatOffer<Reservation> {
  readonly reservation: Reservation
  readonly address: string
  /**
   * O mapa da sala (`ArenaLayout.id`). O mapa é da sala, não de quem entra: o
   * servidor simula nele, e o cliente que subiu outro recarrega neste.
   */
  readonly arenaId: string
}

/**
 * Do servidor para quem acabou de entrar: o token de acesso à sala de voz, assinado
 * com a chave do servidor de mídia. Só o servidor de jogo emite, então só quem joga
 * na sala fala nela (ADR 0026). Sem servidor de mídia configurado, não chega.
 */
export const VOICE_TICKET_MESSAGE = 'voice.ticket'

export interface VoiceTicket {
  readonly token: string
}
