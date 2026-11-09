import type { WireInput } from '@shobu/core'

/** A fila de input de cada jogador, do lado da sala: o `room.inputs` do colyseus. */
export interface InputQueueIo {
  nextInput(playerId: string): WireInput | undefined
  /** Quantos inputs do jogador chegaram e ainda não foram consumidos. */
  pendingInputs(playerId: string): number
  /** Joga fora os `count` inputs mais velhos da fila, sem aplicar: o ack anda assim mesmo. */
  discardInputs(playerId: string, count: number): void
}

/**
 * A janela, em ticks, em que a fila tem de ficar cheia para contar como atraso
 * parado: meio segundo a 60 Hz.
 *
 * O balde de crédito (`INPUT_CREDIT_CAP`) só paga o atraso de um soluço de até
 * 8 ticks. Um soluço maior — o servidor parado 700 ms, em que o colyseus
 * descarta os ticks que não recupera, ou a rede segurando os inputs — deixa na
 * fila o que passou do balde, e o cliente segue mandando um input por tick: a
 * fila nunca mais esvazia, e cada input espera ela inteira. Medido no Chrome
 * com o servidor parado 700 ms: 36 a 40 inputs parados na fila (cerca de
 * 650 ms de ping) até o fim da partida. Com a fila acima de zero a janela
 * inteira, o crédito acabou em todos os ticks dela, e o que nunca saiu da fila
 * é atraso parado, e não rajada: com crédito guardado, a rajada de um quadro
 * lento (até 6 inputs, `MAX_TICKS_PER_FRAME` do cliente) sai no tick em que chega.
 */
export const STANDING_BACKLOG_WINDOW_TICKS = 30

/** O menor tamanho da fila na janela que corre, e quantos ticks ela já tem. */
export interface InputBacklog {
  floor: number
  ticks: number
}

/** A janela vazia: o primeiro tick dá o piso. */
export function createInputBacklog(): InputBacklog {
  return { floor: Number.POSITIVE_INFINITY, ticks: 0 }
}

/**
 * Depois de consumir os inputs do tick: anota a fila, e no fim da janela joga
 * fora o atraso parado, os inputs mais velhos. Jogar fora, e não aplicar mais
 * de um por tick: aplicar o que sobra na fila deixaria um cliente adulterado
 * que manda inputs mais rápido andar mais rápido; jogado fora, mandar a mais
 * não rende nada. O cliente honesto corrige a predição uma vez, do tamanho do
 * que foi jogado fora, e o ping volta ao da rede.
 * ponytail: um tiro num input jogado fora se perde; só acontece depois de um soluço maior que o balde.
 *
 * ```ts
 * trimStandingBacklog(seat.inputBacklog, playerId, io)
 * ```
 */
export function trimStandingBacklog(
  backlog: InputBacklog,
  playerId: string,
  io: InputQueueIo,
): void {
  backlog.floor = Math.min(backlog.floor, io.pendingInputs(playerId))
  backlog.ticks += 1
  if (backlog.ticks < STANDING_BACKLOG_WINDOW_TICKS) return
  const standing = backlog.floor
  Object.assign(backlog, createInputBacklog())
  if (standing > 0) io.discardInputs(playerId, standing)
}
