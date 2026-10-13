/**
 * O matchmaking pela URL, sem o colyseus: qual sala tem qual endereço, e a
 * fila de cada sala cheia. O `filterBy` do colyseus não serve para isto: com a
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
   * nela sem passar pela fila.
   */
  readonly expectedRooms: Set<string>
  readonly issuedSeats: Set<string>
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
  return { rooms: new Map(), queues: new Map(), expectedRooms: new Set(), issuedSeats: new Set() }
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

/**
 * Uma sala com vaga que não seja a pedida. Sala com fila própria fica de fora:
 * a vaga dela é de quem já espera por ela.
 */
function pickProvisional(
  directory: RoomDirectory,
  requested: string,
  hasVacancy: (address: string) => boolean,
): string | undefined {
  for (const address of directory.rooms.keys()) {
    if (address === requested || directory.queues.has(address)) continue
    if (hasVacancy(address)) return address
  }
  return undefined
}

/** O matchmaking vai criar a sala deste endereço: só ela pode se registrar nele. */
export function expectRoom(directory: RoomDirectory, address: string): void {
  directory.expectedRooms.add(address)
}

/**
 * Dois `roomId` para o mesmo endereço é exatamente o defeito que o diretório
 * existe para impedir, então é erro, e não sobrescrita. Sala que o
 * matchmaking não pediu também é erro: veio da rota padrão do colyseus, e o
 * erro impede que ela nasça.
 */
export function registerRoom(directory: RoomDirectory, address: string, roomId: string): void {
  if (!directory.expectedRooms.delete(address)) {
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
}

/**
 * A sala fechou. Quem ainda esperava por ela segue na sala provisória: a sala
 * só fecha vazia, e vazia ela já teria chamado a fila inteira.
 */
export function unregisterRoom(directory: RoomDirectory, address: string): void {
  directory.rooms.delete(address)
  directory.queues.delete(address)
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

/** Quem saiu do jogo enquanto esperava sai de toda fila. */
export function forgetWaiter(directory: RoomDirectory, sessionId: string): void {
  for (const [address, queue] of directory.queues) {
    const kept = queue.filter((waiter) => waiter.sessionId !== sessionId)
    if (kept.length === 0) directory.queues.delete(address)
    else directory.queues.set(address, kept)
  }
}

/** O matchmaking reservou este assento. */
export function issueSeat(directory: RoomDirectory, sessionId: string): void {
  directory.issuedSeats.add(sessionId)
}

/**
 * O assento vale uma entrada, e só se foi o matchmaking que o reservou.
 *
 * ```ts
 * override onAuth(client) { return admitSeat(directory, client.sessionId) }
 * ```
 */
export function admitSeat(directory: RoomDirectory, sessionId: string): boolean {
  return directory.issuedSeats.delete(sessionId)
}
