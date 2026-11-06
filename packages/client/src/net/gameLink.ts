import { Client, type Room } from '@colyseus/sdk'
import { Predict } from '@colyseus/sdk/predict'
import {
  AFK_WARNING_MESSAGE,
  type AfkWarningMessage,
  BOUNDARY_DEATH_MESSAGE,
  type BoundaryDeathMessage,
  CALLSIGN_MESSAGE,
  type CallsignMessage,
  COSMETIC_LOADOUT_MESSAGE,
  type CosmeticLoadoutMessage,
  KILL_MESSAGE,
  LOADOUT_MESSAGE,
  type LoadoutMessage,
  MAP_VOTE_MESSAGE,
  MATCH_SUMMARY_MESSAGE,
  type MapVoteMessage,
  type MatchSummaryMessage,
  type MatchSummaryRow,
  type MeleeWeapon,
  PAGE_RELOAD_CLOSE_CODE,
  PING_REPORT_MESSAGE,
  type PingReportMessage,
  PLAYER_IN_CONTROL_MESSAGE,
  PRIMARY_LOADOUT_MESSAGE,
  type PrimaryLoadoutMessage,
  type PrimaryWeapon,
  ROOM_ENTRY_PATH,
  ROOM_MOVE_MESSAGE,
  type RoomEntryRequest,
  type RoomKillMessage,
  SCORESTREAK_ACTIVATE_MESSAGE,
  SCORESTREAK_ACTIVATED_MESSAGE,
  SCORESTREAK_EARNED_MESSAGE,
  SCORESTREAK_LOADOUT_MESSAGE,
  type ScorestreakActivatedMessage,
  type ScorestreakActivateMessage,
  type ScorestreakEarnedMessage,
  type ScorestreakLoadoutMessage,
  type ScorestreakSlug,
  type SeatOffer,
  SHOT_MESSAGE,
  type ShotMessage,
  VOICE_TICKET_MESSAGE,
  type VoiceTicket,
  type WireInput,
} from '@shobu/core'
import type { MutableWireInput } from './encodeTickInput.ts'
import {
  createPlayerSnapshotFields,
  type PlayerSnapshotFields,
  playersOf,
} from './remotePlayerView.ts'
import {
  matchStateOf,
  type OfficialScoreFields,
  officialScoresOf,
  type RoomMatchFields,
} from './roomMatchView.ts'
import type { CarriedSeat } from './seatCarry.ts'

/**
 * O canal de jogo, do lado do cliente: a interface do projeto sobre o
 * `@colyseus/sdk`. Adapter de rede; quem decide alguma coisa com o que chega
 * daqui está em `remotePlayerView.ts` e no controller.
 */
export interface GameLink {
  readonly sessionId: string
  /** O endereço da sala em que se joga; na fila, é o da sala provisória. */
  readonly address: string
  /** O mapa da sala: é nele que o servidor simula. */
  readonly arenaId: string
  /** O input de um tick, na ordem em que a predição o usou. Devolve o número de sequência dele. */
  sendTickInput(input: WireInput): number
  /** O último número de sequência que o servidor confirmou ter aplicado (`input.lastProcessed`). */
  lastProcessed(): number
  /** O ida e volta suavizado do relógio da sala, em ms; 0 antes da primeira amostra. */
  rttMs(): number
  /** Avança a interpolação até `nowMs` e visita cada outro jogador com o valor interpolado. */
  forEachRemote(
    nowMs: number,
    visit: (playerId: string, fields: PlayerSnapshotFields) => void,
  ): void
  /** O snapshot do próprio jogador, cru, ou `undefined` antes do primeiro estado. */
  ownSnapshot(): PlayerSnapshotFields | undefined
  /** Cada kill da sala, de qualquer um, na ordem do servidor. */
  onKill(listener: (kill: RoomKillMessage) => void): void
  /** Cada morte por sair da área de jogo. */
  onBoundaryDeath(listener: (playerId: string) => void): void
  /** Cada tiro da sala, de qualquer um, inclusive o deste jogador. */
  onShot(listener: (shot: ShotMessage) => void): void
  /** A lâmina da classe que o jogador escolheu: o servidor anda o corpo com ela. */
  sendLoadout(meleeWeapon: MeleeWeapon): void
  /** A arma principal da classe: os outros clientes a leem no estado da sala. */
  sendPrimary(primaryWeapon: PrimaryWeapon): void
  /** O nome de perfil: os outros clientes o leem no estado da sala. */
  sendCallsign(callsign: string): void
  /** A skin e o acabamento da sniper: os outros clientes os leem no estado da sala. */
  sendCosmetics(look: CosmeticLoadoutMessage): void
  /** O jogador saiu do menu e pegou o controle (`PLAYER_IN_CONTROL_MESSAGE`). */
  sendInControl(): void
  /** As três séries de pontuação da escolha (ADR 0029): a sala decide com elas. */
  sendScorestreaks(scorestreaks: readonly ScorestreakSlug[]): void
  /** O pedido de acionar a série do slot; a sala confere e avisa todo mundo. */
  sendScorestreakActivation(slot: number): void
  /** Cada série que a sala diz que este jogador ganhou. Só o dono recebe. */
  onScorestreakEarned(listener: (earned: ScorestreakEarnedMessage) => void): void
  /** Cada série acionada na sala, de qualquer um. */
  onScorestreakActivated(listener: (activated: ScorestreakActivatedMessage) => void): void
  /** A vaga abriu na sala pedida: o assento já está reservado, e ninguém o ocupou. */
  onMove(listener: (next: ReservedSeat) => void): void
  /** O token da sala de voz. Sem servidor de mídia, nunca chama. */
  onVoiceTicket(listener: (ticket: VoiceTicket) => void): void
  /**
   * A partida da sala (ADR 0031): a fase, o que falta dela, o mapa e o voto,
   * ou `undefined` antes do primeiro estado.
   */
  matchState(): RoomMatchFields | undefined
  /** O placar oficial de cada jogador da sala, inclusive o deste, pelo id da sala. */
  forEachScore(visit: (playerId: string, score: OfficialScoreFields) => void): void
  /**
   * O resumo da partida que acabou, do MVP ao último. Chega no fim da partida
   * e na entrada durante o intervalo; o último que chegou espera o ouvinte.
   */
  onMatchSummary(listener: (rows: readonly MatchSummaryRow[]) => void): void
  /** O voto do jogador no próximo mapa, pelo índice da opção (`mapVoteOptions`). */
  sendMapVote(optionIndex: number): void
  /** O rtt deste cliente, para a coluna de ping do tab dos outros (`pingReport.ts`). */
  sendPing(rttMs: number): void
  /** O aviso de inatividade da sala: os segundos até ela tirar este jogador (ADR 0031). */
  onAfkWarning(listener: (secondsLeft: number) => void): void
  /**
   * O token que volta para esta mesma vaga depois de a página recarregar no
   * mapa que o voto escolheu (`reconnectCarry.ts`): a sala o guarda pela
   * janela da reserva (ADR 0031).
   */
  readonly reconnectionToken: string
  /**
   * A sala acabou para este link, uma vez só: a conexão caiu, o servidor fechou,
   * ou o jogador saiu (`leave`, `follow`). Chama já na saída, sem esperar o
   * fechamento, para nada mais sair por uma conexão que está fechando. O
   * código é o do fechamento, e `undefined` na saída pedida daqui.
   */
  onClose(listener: (code: number | undefined) => void): void
  leave(): Promise<void>
  /**
   * Fecha a conexão sem pedir para sair, com `PAGE_RELOAD_CLOSE_CODE`: para
   * a sala, é a saída para a recarga, e a vaga segurada no mapa novo começa a
   * esperar a volta já (`onDrop`). É a saída da página com a vaga segurada (`roomLeavingWithPage`).
   */
  drop(): Promise<void>
}

type SeatReservation = Parameters<Client['consumeSeatReservation']>[0]

/** A reserva como o servidor a manda: é o que atravessa a recarga da página (`seatCarry.ts`). */
export type CarriedOffer = SeatOffer<SeatReservation>

/**
 * Um assento reservado e ainda livre: a sala, o mapa dela, e ocupá-lo
 * (`roomFollower.ts`). A volta à vaga depois da troca de mapa não tem
 * reserva: tem o token de reconexão, e `offer` vem vazio.
 */
export interface ReservedSeat {
  readonly offer: CarriedOffer | undefined
  readonly address: string
  readonly arenaId: string
  take(): Promise<GameLink>
}

const INTERPOLATED_FIELDS = ['x', 'y', 'z', 'aimX', 'aimY', 'aimZ'] as const

/** O que quem entra diz de si no pedido de entrada: o nome, o visual e a chave do aparelho. */
export interface SeatEntrant extends Partial<CosmeticLoadoutMessage> {
  readonly callsign?: string | undefined
  /** `readDeviceKey`: o banimento da sala a reconhece (ADR 0034). */
  readonly deviceKey?: string
}

/**
 * Pede a entrada na rota de matchmaking do servidor de jogo (ADR 0032): pelo
 * endereço, o assento na sala dele, ou numa provisória com a pedida cheia;
 * pela partida rápida, na sala pública que o servidor escolher; pela NOVA
 * PARTIDA, numa sala nova. Uma sala nova nasce no mapa do pedido; numa que já
 * existe, vale o dela (`SeatOffer.arenaId`). Quem decide ocupar o assento é
 * quem segue a sala (`roomFollower.ts`). Com uma
 * reserva carregada da página anterior, entra com ela, sem pedir; se ela já
 * venceu, pede outra, e a sala dela, se ainda existe, é a do mapa subido.
 * Com a volta carregada da troca de mapa pelo voto, reconecta à mesma vaga
 * pelo token, e pede outra se a sala já a soltou (ADR 0031).
 * Fora disso, sem reconexão: o sdk vem com ela ligada, e a sala não guarda a
 * vaga de quem cai (docs/rede, "Reconexão").
 *
 * ```ts
 * const seat = await requestSeat(gameServerUrl(location, 2567), { kind: 'address', address, arenaId }, delayMs, carried)
 * ```
 */
export async function requestSeat(
  serverUrl: string,
  request: RoomEntryRequest,
  interpolationDelayMs: number,
  carried?: CarriedSeat<CarriedOffer>,
  entrant: SeatEntrant = {},
): Promise<ReservedSeat> {
  const client = new Client(serverUrl)
  const ask = async (): Promise<CarriedOffer> => {
    // o nome e o visual vão junto: a sala nomeia e veste a vaga já na entrada
    // (`entryCallsignOf`, `entryLookOf`); a chave, para o banimento (`entryDeviceKeyOf`).
    const body = { ...request, ...entrant }
    const { data } = await client.http.post(ROOM_ENTRY_PATH, { body })
    return data as CarriedOffer
  }
  if (!carried) return reservedSeat(client, await ask(), interpolationDelayMs)
  const seat =
    carried.kind === 'offer'
      ? reservedSeat(client, carried.offer, interpolationDelayMs)
      : rejoinedSeat(client, carried, request.arenaId, interpolationDelayMs)
  const take = async (): Promise<GameLink> =>
    seat.take().catch(async () => takeSeat(client, await ask(), interpolationDelayMs))
  return { ...seat, take }
}

function reservedSeat(
  client: Client,
  offer: CarriedOffer,
  interpolationDelayMs: number,
): ReservedSeat {
  const { address, arenaId } = offer
  return { offer, address, arenaId, take: () => takeSeat(client, offer, interpolationDelayMs) }
}

/**
 * A mesma vaga, depois da recarga no mapa que o voto escolheu: o mapa é o que
 * a página acabou de subir, que é o da sala.
 */
function rejoinedSeat(
  client: Client,
  carried: { readonly address: string; readonly token: string },
  arenaId: string,
  interpolationDelayMs: number,
): ReservedSeat {
  const { address } = carried
  const take = async (): Promise<GameLink> =>
    linkOf(
      await client.reconnect(carried.token),
      client,
      { address, arenaId },
      interpolationDelayMs,
    )
  return { offer: undefined, address, arenaId, take }
}

async function takeSeat(
  client: Client,
  offer: SeatOffer<SeatReservation>,
  interpolationDelayMs: number,
): Promise<GameLink> {
  const room: Room = await client.consumeSeatReservation(offer.reservation)
  return linkOf(room, client, offer, interpolationDelayMs)
}

/** O link sobre a sala em que se entrou, por reserva ou de volta pelo token. */
function linkOf(
  room: Room,
  client: Client,
  where: { readonly address: string; readonly arenaId: string },
  interpolationDelayMs: number,
): GameLink {
  room.reconnection.enabled = false
  return {
    sessionId: room.sessionId,
    address: where.address,
    arenaId: where.arenaId,
    ...createInputChannel(room, interpolationDelayMs),
    forEachRemote: createRemoteReader(room, interpolationDelayMs),
    ownSnapshot: () => playersOf(room.state).get(room.sessionId),
    rttMs: () => room.clock.smoothedRtt(),
    onVoiceTicket: createLatchedChannel<VoiceTicket>(room, VOICE_TICKET_MESSAGE),
    // getter: o token muda a cada reconexão, e o que vale é o de agora.
    get reconnectionToken(): string {
      return room.reconnectionToken
    },
    ...createMatchChannel(room),
    ...createEventChannel(room),
    ...createProfileChannel(room),
    ...createScorestreakChannel(room),
    onMove: createMoveChannel(room, client, interpolationDelayMs),
    ...createLeaveChannel(room),
  }
}

/** O aviso de inatividade, como chega: só os segundos interessam a quem ouve. */
function afkWarningsOf(room: Room): GameLink['onAfkWarning'] {
  const onWarning = createLatchedChannel<AfkWarningMessage>(room, AFK_WARNING_MESSAGE)
  return (listener) => onWarning((warning) => listener(warning.secondsLeft))
}

/** A saída da sala, pedida ou não, avisada uma vez. */
function createLeaveChannel(room: Room): Pick<GameLink, 'leave' | 'drop' | 'onClose'> {
  const close = createCloseSignal()
  // sem reconexão, sair da sala é silencioso: o jogo segue sozinho. o log com
  // o código é o que diz se a sala caiu, e por quê.
  room.onLeave((code, reason) => {
    console.warn(JSON.stringify({ event: 'room.left', code, reason }))
    close.fire(code)
  })
  return {
    leave: async () => {
      close.fire(undefined)
      await room.leave()
    },
    drop: () => {
      close.fire(undefined)
      // sem o LEAVE_ROOM, o servidor chama o `onDrop`, e o código diz que é a
      // recarga com o token guardado: é só ela que segura a vaga. O
      // `leave(false)` fechava sem código (1005), igual a qualquer queda.
      room.connection.close(PAGE_RELOAD_CLOSE_CODE)
      return Promise.resolve()
    },
    onClose: close.listen,
  }
}

type CloseListener = (code: number | undefined) => void

/** O fim da sala, avisado uma vez a cada ouvinte, venha de onde vier, com o código. */
function createCloseSignal(): {
  fire(code: number | undefined): void
  listen(listener: CloseListener): void
} {
  const listeners: CloseListener[] = []
  const closed = { fired: false, code: undefined as number | undefined }
  return {
    fire: (code) => {
      if (closed.fired) return
      closed.fired = true
      closed.code = code
      for (const listener of listeners) listener(code)
    },
    listen: (listener) => {
      if (closed.fired) listener(closed.code)
      else listeners.push(listener)
    },
  }
}

/**
 * A partida da sala (ADR 0031): o estado traz a fase, o placar e os votos; o
 * resumo chega como mensagem, e o voto vai como mensagem.
 */
function createMatchChannel(
  room: Room,
): Pick<
  GameLink,
  'matchState' | 'forEachScore' | 'onMatchSummary' | 'sendMapVote' | 'sendPing' | 'onAfkWarning'
> {
  const onSummary = createLatchedChannel<MatchSummaryMessage>(room, MATCH_SUMMARY_MESSAGE)
  return {
    matchState: () => matchStateOf(room.state),
    forEachScore: (visit) => {
      for (const [playerId, score] of officialScoresOf(room.state)) visit(playerId, score)
    },
    onMatchSummary: (listener) => onSummary((summary) => listener(summary.rows)),
    sendMapVote: (optionIndex) =>
      room.send(MAP_VOTE_MESSAGE, { optionIndex } satisfies MapVoteMessage),
    sendPing: (rttMs) => room.send(PING_REPORT_MESSAGE, { rttMs } satisfies PingReportMessage),
    onAfkWarning: afkWarningsOf(room),
  }
}

/** A chamada da fila: o assento reservado na sala pedida, para quem segue a sala ocupar. */
function createMoveChannel(
  room: Room,
  client: Client,
  interpolationDelayMs: number,
): GameLink['onMove'] {
  return (listener) => {
    room.onMessage(ROOM_MOVE_MESSAGE, (next: CarriedOffer) =>
      listener(reservedSeat(client, next, interpolationDelayMs)),
    )
  }
}

/**
 * O que o jogador diz de si à sala: a lâmina e a arma principal da classe, o
 * visual e o nome de perfil.
 */
function createProfileChannel(
  room: Room,
): Pick<
  GameLink,
  'sendLoadout' | 'sendPrimary' | 'sendCallsign' | 'sendCosmetics' | 'sendInControl'
> {
  return {
    sendLoadout: (meleeWeapon) =>
      room.send(LOADOUT_MESSAGE, { meleeWeapon } satisfies LoadoutMessage),
    sendPrimary: (primaryWeapon) =>
      room.send(PRIMARY_LOADOUT_MESSAGE, { primaryWeapon } satisfies PrimaryLoadoutMessage),
    sendCallsign: (callsign) => room.send(CALLSIGN_MESSAGE, { callsign } satisfies CallsignMessage),
    sendCosmetics: (look) =>
      room.send(COSMETIC_LOADOUT_MESSAGE, { ...look } satisfies CosmeticLoadoutMessage),
    sendInControl: () => room.send(PLAYER_IN_CONTROL_MESSAGE),
  }
}

/** As séries de pontuação: a escolha e o aperto vão, o ganho e o acionamento voltam. */
function createScorestreakChannel(
  room: Room,
): Pick<
  GameLink,
  | 'sendScorestreaks'
  | 'sendScorestreakActivation'
  | 'onScorestreakEarned'
  | 'onScorestreakActivated'
> {
  return {
    sendScorestreaks: (scorestreaks) =>
      room.send(SCORESTREAK_LOADOUT_MESSAGE, { scorestreaks } satisfies ScorestreakLoadoutMessage),
    sendScorestreakActivation: (slot) =>
      room.send(SCORESTREAK_ACTIVATE_MESSAGE, { slot } satisfies ScorestreakActivateMessage),
    onScorestreakEarned: (listener) => {
      room.onMessage(SCORESTREAK_EARNED_MESSAGE, listener)
    },
    onScorestreakActivated: (listener) => {
      room.onMessage(SCORESTREAK_ACTIVATED_MESSAGE, listener)
    },
  }
}

/** As mortes da sala, de tiro, de lâmina e fora da área, e os tiros, na ordem do servidor. */
function createEventChannel(room: Room): Pick<GameLink, 'onKill' | 'onBoundaryDeath' | 'onShot'> {
  return {
    onShot: (listener) => {
      room.onMessage(SHOT_MESSAGE, listener)
    },
    onKill: (listener) => {
      room.onMessage(KILL_MESSAGE, listener)
    },
    onBoundaryDeath: (listener) => {
      room.onMessage(BOUNDARY_DEATH_MESSAGE, (death: BoundaryDeathMessage) =>
        listener(death.playerId),
      )
    },
  }
}

/**
 * O servidor manda o token de voz e o resumo do intervalo logo depois da
 * entrada, e eles podem chegar antes de alguém escutar: o sdk descarta
 * mensagem sem ouvinte, então o canal guarda a última até ser pedida.
 */
function createLatchedChannel<Message>(
  room: Room,
  type: string,
): (listener: (message: Message) => void) => void {
  let received: Message | undefined
  let listening: ((message: Message) => void) | undefined
  room.onMessage(type, (message: Message) => {
    received = message
    listening?.(message)
  })
  return (listener) => {
    listening = listener
    if (received) listener(received)
  }
}

/**
 * O canal de input confiável do sdk. Copia campo a campo no mesmo objeto, sem
 * alocar por tick; o `sentCount` depois do envio é o número de sequência que o
 * servidor confirma de volta em `lastProcessed`.
 *
 * O `renderDelay` é o atraso de interpolação do `Predict`: o sdk carimba cada
 * input com o instante do servidor que a tela mostrava, e o rewind do servidor
 * rebobina até ele. Sem ele o carimbo sai sem o buffer, e o servidor validaria
 * o tiro contra posições um buffer inteiro mais novas que as da tela.
 */
function createInputChannel(
  room: Room,
  renderDelayMs: number,
): Pick<GameLink, 'sendTickInput' | 'lastProcessed'> {
  const input = room.input({ renderDelay: renderDelayMs })
  const data = input.data as MutableWireInput
  return {
    sendTickInput: (wire) => {
      data.wishX = wire.wishX
      data.wishZ = wire.wishZ
      data.buttons = wire.buttons
      data.aimX = wire.aimX
      data.aimY = wire.aimY
      data.aimZ = wire.aimZ
      input.send()
      return input.sentCount
    },
    lastProcessed: () => input.lastProcessed,
  }
}

/**
 * O `Predict` da 0.18 interpola cada jogador no relógio do servidor, com o
 * atraso do buffer de interpolação. A postura, o `alive` e a arma não se
 * interpolam: são estado discreto, e o meio do caminho entre "em pé" e "no
 * slide", ou entre a laser (0) e a clássica (1), não existe.
 */
function createRemoteReader(room: Room, delayMs: number): GameLink['forEachRemote'] {
  const predict = Predict.get(room, { mode: 'lerp', delay: delayMs })
  predict.attachAll('players', { fields: [...INTERPOLATED_FIELDS] })
  const scratch = createPlayerSnapshotFields()
  return (nowMs, visit) => {
    predict.tick(nowMs)
    for (const [playerId, player] of playersOf(room.state)) {
      if (playerId === room.sessionId) continue
      for (const field of INTERPOLATED_FIELDS) scratch[field] = predict.value(player, field)
      scratch.stance = player.stance
      scratch.alive = player.alive
      scratch.name = player.name
      scratch.primary = player.primary
      scratch.skin = player.skin
      scratch.finish = player.finish
      scratch.accent = player.accent
      visit(playerId, scratch)
    }
  }
}
