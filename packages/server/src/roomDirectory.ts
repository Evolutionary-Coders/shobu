import { generateRoomAddress, type RoomVisibility } from '@shobu/core'

/**
 * O matchmaking, sem o colyseus: qual sala tem qual endereço, quais delas são
 * privadas, e a fila de cada sala cheia. Pelo endereço da URL, qualquer sala
 * aberta recebe quem tem o link; sem endereço, a partida rápida só olha as
 * públicas (ADR 0032). O `filterBy` do colyseus não serve para isto: com a
 * sala cheia, o `joinOrCreate` dele cria uma segunda sala com o mesmo
 * endereço, e quem abriu o link cairia longe de quem o mandou (ADR 0028).
 *
 * ponytail: o diretório vive na memória de um processo só. Com mais de um
 * processo de servidor de jogo, ele vira um registro compartilhado (a
 * `presence` do colyseus).
 */
export interface RoomDirectory {
  /** O endereço de cada sala aberta, e o `roomId` dela no colyseus. */
  readonly rooms: Map<string, string>
  /** Quem espera vaga em cada endereço, por ordem de chegada. */
  readonly queues: Map<string, Waiter[]>
  /**
   * Os endereços cujas salas o próprio matchmaking mandou criar, e os assentos
   * que ele reservou. A rota padrão `/matchmake` do colyseus continua no ar, e
   * sem isto um cliente adulterado criaria a sala de um endereço ou entraria
   * nela sem passar pela fila. A sala esperada já sabe se nasce privada.
   */
  readonly expectedRooms: Map<string, RoomVisibility>
  /**
   * As salas abertas que só recebem quem tem o link: nem a partida rápida nem
   * a fila de outra sala as usam.
   */
  readonly privateRooms: Set<string>
  /**
   * Cada assento reservado e ainda não ocupado, com o endereço da sala dele: a
   * partida rápida conta quem já está a caminho de uma sala como gente nela.
   */
  readonly pendingSeats: Map<string, string>
}

/** Um jogador da fila e a sala provisória em que ele joga enquanto espera. */
export interface Waiter {
  readonly sessionId: string
  readonly roomId: string
}

/**
 * O que fazer com quem abriu um endereço:
 * - `create`: não há sala nele, e ela nasce agora;
 * - `join`: a sala tem vaga e ninguém espera por ela;
 * - `wait`: a sala está cheia, ou a vaga já é de alguém da fila. O jogador
 *   entra na fila e joga na sala provisória `provisional`; sem nenhuma sala
 *   com vaga, uma sala nova é aberta para ele.
 */
export type EntryPlan =
  | { readonly kind: 'create'; readonly address: string }
  | { readonly kind: 'join'; readonly address: string }
  | { readonly kind: 'wait'; readonly address: string; readonly provisional: string | undefined }

export function createRoomDirectory(): RoomDirectory {
  return {
    rooms: new Map(),
    queues: new Map(),
    expectedRooms: new Map(),
    privateRooms: new Set(),
    pendingSeats: new Map(),
  }
}

/**
 * ```ts
 * const plan = planEntry(directory, '203.0.113.7', (address) => vacancyOf(address))
 * ```
 */
export function planEntry(
  directory: RoomDirectory,
  address: string,
  hasVacancy: (address: string) => boolean,
): EntryPlan {
  if (!directory.rooms.has(address)) return { kind: 'create', address }
  if (hasVacancy(address) && !directory.queues.has(address)) return { kind: 'join', address }
  return { kind: 'wait', address, provisional: pickProvisional(directory, address, hasVacancy) }
}

/** Uma sala pública com vaga que não seja a pedida. */
function pickProvisional(
  directory: RoomDirectory,
  requested: string,
  hasVacancy: (address: string) => boolean,
): string | undefined {
  return openPublicRooms(directory, hasVacancy, requested).next().value ?? undefined
}

/**
 * As salas em que um estranho pode cair: públicas, com vaga e sem fila. Sala
 * com fila própria fica de fora porque a vaga dela é de quem já espera por
 * ela; a privada, porque só entra nela quem tem o link. É a busca da sala
 * provisória e da partida rápida.
 *
 * ```ts
 * for (const address of openPublicRooms(directory, hasVacancy, requested)) reserveIn(address)
 * ```
 */
export function* openPublicRooms(
  directory: RoomDirectory,
  hasVacancy: (address: string) => boolean,
  except?: string,
): Generator<string, undefined> {
  for (const address of directory.rooms.keys()) {
    if (address === except || directory.queues.has(address)) continue
    if (directory.privateRooms.has(address) || !hasVacancy(address)) continue
    yield address
  }
  return undefined
}

/**
 * Onde sai o assento de um plano: a sala em que o jogador entra, se ela nasce
 * agora, e se ele espera na fila da pedida. Sem provisória com vaga, a sala
 * provisória nasce num endereço livre.
 *
 * Toda sala que nasce por aqui é pública, a do endereço pedido também. Um
 * endereço sem sala atrás dele é um link velho (a sala fechou vazia), um
 * endereço digitado, ou o F5 numa sala que o servidor fechou (a saída por
 * inatividade, o servidor reiniciado). Privada, ela prendia esse jogador
 * sozinho com três bots, fora da partida rápida, e a ENTRAR o deixava lá
 * (ADR 0032). Pública, a partida rápida a completa, e quem tem o link cai
 * nela do mesmo jeito: o link continua sendo o convite. A sala privada só
 * nasce pedida, pela NOVA PARTIDA com PRIVADA e pelo TREINO.
 */
export interface SeatTarget {
  readonly address: string
  readonly create: boolean
  readonly queued: boolean
}

/**
 * ```ts
 * const target = seatTargetOf(plan, () => freeAddress(directory, nextUint32))
 * ```
 */
export function seatTargetOf(plan: EntryPlan, freeAddress: () => string): SeatTarget {
  if (plan.kind === 'create') return { address: plan.address, create: true, queued: false }
  if (plan.kind === 'join') return { address: plan.address, create: false, queued: false }
  if (plan.provisional) return { address: plan.provisional, create: false, queued: true }
  return { address: freeAddress(), create: true, queued: true }
}

/** Um endereço sorteado que nenhuma sala aberta, nem uma a caminho, usa. */
export function freeAddress(directory: RoomDirectory, nextUint32: () => number): string {
  for (;;) {
    const address = generateRoomAddress(nextUint32)
    if (!directory.rooms.has(address) && !directory.expectedRooms.has(address)) return address
  }
}

/**
 * O matchmaking vai criar a sala deste endereço, com esta visibilidade: só ela
 * pode se registrar nele.
 *
 * ```ts
 * expectRoom(directory, '203.0.113.7', 'private')
 * ```
 */
export function expectRoom(
  directory: RoomDirectory,
  address: string,
  visibility: RoomVisibility,
): void {
  directory.expectedRooms.set(address, visibility)
}

/**
 * A criação terminou, com a sala registrada ou não: o pedido deixa de valer.
 * Uma criação que falhou não deixa o endereço aberto para a rota padrão.
 */
export function settleExpectedRoom(directory: RoomDirectory, address: string): void {
  directory.expectedRooms.delete(address)
}

/**
 * Dois `roomId` para o mesmo endereço é exatamente o defeito que o diretório
 * existe para impedir, então é erro, e não sobrescrita. Sala que o
 * matchmaking não pediu também é erro: veio da rota padrão do colyseus, e o
 * erro impede que ela nasça.
 */
export function registerRoom(directory: RoomDirectory, address: string, roomId: string): void {
  const visibility = directory.expectedRooms.get(address)
  directory.expectedRooms.delete(address)
  if (visibility === undefined) {
    throw new Error(
      `sala '${roomId}' no endereço '${address}' sem pedido do matchmaking; esperado entrar por POST /rooms/enter`,
    )
  }
  const existing = directory.rooms.get(address)
  if (existing !== undefined) {
    throw new Error(
      `o endereço '${address}' já é da sala '${existing}'; esperado endereço livre para '${roomId}'`,
    )
  }
  directory.rooms.set(address, roomId)
  if (visibility === 'private') directory.privateRooms.add(address)
}

/**
 * A sala fechou. Quem ainda esperava por ela segue na sala provisória: a sala
 * só fecha vazia, e vazia ela já teria chamado a fila inteira.
 */
export function unregisterRoom(directory: RoomDirectory, address: string): void {
  directory.rooms.delete(address)
  directory.queues.delete(address)
  directory.privateRooms.delete(address)
}

export function enqueueWaiter(directory: RoomDirectory, address: string, waiter: Waiter): void {
  const queue = directory.queues.get(address)
  if (queue) queue.push(waiter)
  else directory.queues.set(address, [waiter])
}

/** O primeiro da fila, que sai dela. A fila vazia deixa de existir. */
export function takeNextWaiter(directory: RoomDirectory, address: string): Waiter | undefined {
  const queue = directory.queues.get(address)
  const waiter = queue?.shift()
  if (queue?.length === 0) directory.queues.delete(address)
  return waiter
}

/**
 * O primeiro da fila que ainda está no jogo. Quem saiu enquanto esperava sai
 * da fila junto, sem ser chamado.
 *
 * ```ts
 * takeReachableWaiter(directory, address, (waiter) => clientOf(waiter) !== undefined)
 * ```
 */
export function takeReachableWaiter(
  directory: RoomDirectory,
  address: string,
  isReachable: (waiter: Waiter) => boolean,
): Waiter | undefined {
  for (;;) {
    const waiter = takeNextWaiter(directory, address)
    if (!waiter || isReachable(waiter)) return waiter
  }
}

/** Quem saiu do jogo enquanto esperava sai de toda fila. */
export function forgetWaiter(directory: RoomDirectory, sessionId: string): void {
  for (const [address, queue] of directory.queues) {
    const kept = queue.filter((waiter) => waiter.sessionId !== sessionId)
    if (kept.length === 0) directory.queues.delete(address)
    else directory.queues.set(address, kept)
  }
}

/** O matchmaking reservou este assento, na sala deste endereço. */
export function issueSeat(directory: RoomDirectory, sessionId: string, address: string): void {
  directory.pendingSeats.set(sessionId, address)
}

/**
 * Quantos assentos reservados ainda estão a caminho da sala deste endereço.
 *
 * ```ts
 * pendingSeatsAt(directory, '203.0.113.7') // 1: alguém entrou e a página ainda carrega
 * ```
 */
export function pendingSeatsAt(directory: RoomDirectory, address: string): number {
  let count = 0
  for (const seatAddress of directory.pendingSeats.values()) {
    if (seatAddress === address) count += 1
  }
  return count
}

/**
 * O assento vale uma entrada, e só se foi o matchmaking que o reservou.
 *
 * ```ts
 * override onAuth(client) { return admitSeat(directory, client.sessionId) }
 * ```
 */
export function admitSeat(directory: RoomDirectory, sessionId: string): boolean {
  return directory.pendingSeats.delete(sessionId)
}
