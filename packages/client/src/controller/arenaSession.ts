import {
  applyBoundaryDeath,
  armMovementInput,
  type BotDifficulty,
  type BotPlayer,
  type BotSquad,
  boundaryRemainingS,
  DEFAULT_PROFILE_NAME,
  type Fighter,
  findGrappleAnchor,
  type GameplayConfig,
  type MedalAward,
  type MeleeState,
  type MeleeWeapon,
  type NavGraph,
  type PlayArea,
  rearmMelee,
  rearmWeapon,
  type Scoreboard,
  type ShotHit,
  type StaticBox,
  stepArsenal,
  stepBoundary,
  type Vector3,
  type WeaponState,
} from '@shobu/core'
import {
  type CombatScope,
  stepBots,
  stepLocalRespawn,
  type TickCombat,
  tryLocalShot,
  tryLocalStrike,
} from './arenaCombat.ts'
import {
  type BotTracer,
  createKillNotice,
  type FrameLog,
  type KillNotice,
} from './arenaFrameLog.ts'
import { frameForRoom, type RoomFeed, roomMethods, wishForRoom } from './arenaOnline.ts'
import { type ArenaParts, createArenaParts, LOCAL_PLAYER_ID, openFrameLogs } from './arenaParts.ts'
import { endMatch, restartArena } from './arenaRestart.ts'
import type { LocalCharacter } from './localCharacter.ts'
import type { MutableWeaponInput } from './weaponInputFrom.ts'
import type { MutableMovementInput } from './wishDirection.ts'

/** O que o quadro traz do render para a simulação. */
export interface ArenaFrame {
  readonly elapsedS: number
  /**
   * O olho interpolado **sem balanço de câmera**: é de onde o tiro sai
   * (`viewBob.ts`), e é o que o servidor rebobina (ADR 0002).
   */
  readonly eyeM: Readonly<Vector3>
  /** A frente da câmera, em mundo. Não precisa vir unitária. */
  readonly aimM: Readonly<Vector3>
}

/**
 * As regras da partida que o menu escolhe: na partida os bots atiram, no
 * treino não; e o nível deles, que o jogador escolhe nas configurações.
 */
export interface MatchRules {
  readonly hostileBots: boolean
  readonly botDifficulty: BotDifficulty
  /** Quantos bots jogam, das vagas da sala (`seatBots`): o BOTS da nova partida. */
  readonly botCount: number
  /** O slot de corpo a corpo da classe do jogador (ADR 0021). */
  readonly meleeWeapon: MeleeWeapon
  /**
   * O nome do jogador nesta partida, já pronto para a tela (`profileNameLabel`):
   * o placar, o killfeed e as telas de abate o leem por `nameOf`. Ausente, fica
   * o da partida anterior.
   */
  readonly callsign?: string
  /**
   * O relógio encerra a partida: em `match.durationS` tudo congela e
   * `matchOver` acende. É a partida; o treino não tem relógio (`matchClock.ts`)
   * e anda para sempre. Ausente, não encerra.
   */
  readonly timed?: boolean
}

export interface ArenaSession {
  readonly character: LocalCharacter
  readonly weapon: Readonly<WeaponState>
  /** O corpo a corpo do jogador: a katana na mão e os golpes, para o viewmodel e o som. */
  readonly melee: Readonly<MeleeState>
  /** O jogador local como combatente: vivo ou não, e quanto falta para voltar. */
  readonly local: Readonly<Fighter>
  /** Os bots que completam a sala (ADR 0016). */
  readonly bots: readonly BotPlayer[]
  /** Todo mundo na arena: o jogador local primeiro, os bots depois. */
  readonly fighters: readonly Fighter[]
  readonly scoreboard: Readonly<Scoreboard>
  /**
   * O tiro do jogador neste quadro, ou `undefined`. **Reaproveitado**: vale só
   * até o próximo `advance`, e quem precisar guardar copia.
   */
  readonly lastShot: Readonly<ShotHit> | undefined
  /**
   * As medalhas da kill do jogador neste quadro, vazio quando não houve
   * nenhuma. **Reaproveitado**, com o mesmo contrato do `lastShot`.
   */
  readonly lastMedals: readonly MedalAward[]
  /** As kills deste quadro, de qualquer um. Mesmo contrato do `lastShot`. */
  readonly lastKills: Readonly<FrameLog<KillNotice>>
  /** Os tiros dos bots neste quadro, para o rastro. Mesmo contrato do `lastShot`. */
  readonly lastBotShots: Readonly<FrameLog<BotTracer>>
  /** Quem matou o jogador local, enquanto ele espera o respawn; `null` com ele vivo. */
  readonly killedBy: string | null
  /**
   * Como a última morte do jogador aconteceu: arma, distância, cabeça, ar,
   * luneta e gancho. É a tela de morte; só vale com `killedBy` preenchido.
   */
  readonly deathCause: Readonly<KillNotice>
  /** Segundos de partida já simulados. É o `atS` do evento de kill. */
  readonly matchTimeS: number
  /**
   * Há onde o gancho prender na mira, solto e pronto — é o aviso da retícula.
   * Sai do mesmo raio do disparo (`findGrappleAnchor`), **uma vez por tick** e
   * não por quadro: a 240 Hz seriam quatro raios para a mesma resposta.
   */
  readonly grappleInReach: boolean
  /**
   * Quanto falta para o prazo fora da área de jogo vencer, ou `null` dentro
   * dela. É o número que o aviso da tela conta; `null` apaga o aviso.
   */
  readonly boundaryRemainingS: number | null
  /**
   * Quantas vezes o jogador morreu por ficar fora da área. É também o rodízio
   * dos spawns: a morte `n` reaparece em `respawnFeetM[n % length]`.
   */
  readonly boundaryDeaths: number
  /**
   * O tempo acabou: a arena congelou no tick em que o relógio zerou — ninguém
   * anda, atira nem pontua, e a luneta fechou. Só uma partida com `timed`
   * acaba; quem a reabre é `restartMatch`.
   */
  readonly matchOver: boolean
  /**
   * A semente desta partida: a da sala, mais quantas partidas ela já começou.
   * É dela que sai o voto dos bots no próximo mapa (`mapVote.ts`), e o servidor
   * chega ao mesmo voto sem trocar mensagem.
   */
  readonly matchSeed: number
  /**
   * O nome de um id do placar: o nome de perfil para o jogador local (o padrão,
   * `AGENTE`, até a partida dizer outro), o apelido para um bot.
   */
  nameOf(playerId: string): string
  /**
   * Começa uma partida nova com as regras do modo: o relógio, o placar, as
   * medalhas e os spawns voltam ao zero. `matchTimeS` anda desde o **primeiro
   * quadro simulado**: sem isto, quem fica no menu entra numa partida que o
   * relógio já dá por encerrada — e a música e os marcos do narrador leem
   * esse relógio.
   *
   * O placar zera junto (até o fim de partida existir, ele atravessava
   * partidas): o jogador volta ao primeiro spawn, e os bots a spawns sorteados.
   */
  restartMatch(rules: MatchRules): void
  advance(frame: Readonly<ArenaFrame>): number
  /**
   * Online, o que a sala mudou desde o quadro anterior: o spawn deste jogador,
   * os outros e as mortes. Chamar antes do `advance` do quadro. Sem sala
   * conectada não faz nada, e a arena segue sozinha com os bots locais.
   */
  followRoom(feed: RoomFeed, nowMs: number, frameS: number): void
  /** Online, cada outro jogador da sala, pelo id da sala, com o corpo que a cena desenha. */
  forEachRoomPlayer(visit: (playerId: string, fighter: Readonly<Fighter>) => void): void
}

export interface ArenaSessionOptions {
  readonly config: GameplayConfig
  readonly character: LocalCharacter
  readonly boxes: readonly StaticBox[]
  /** Por onde os bots andam (`ichibanGaiNavGraph.ts`). */
  readonly navGraph: NavGraph
  readonly movementInput: MutableMovementInput
  readonly weaponInput: MutableWeaponInput
  /** Até onde a partida vai. Fora dela, a contagem de `match.outOfBoundsGraceS`. */
  readonly playArea: PlayArea
  /**
   * Onde se reaparece, **no pé** e não na convenção de olho dos spawns: o
   * jogador depois da morte, e os bots sempre. Não pode ser vazia.
   */
  readonly respawnFeetM: readonly Readonly<Vector3>[]
  /**
   * Quantos humanos há na sala. Sem servidor, só o jogador local; é o que
   * decide quantos bots completam a sala (`botSeatsFor`).
   */
  readonly humans?: number
  /**
   * A semente base da partida. Hoje é fixa; quando o colyseus entrar ela vem
   * da mensagem de entrada na sala e mais nada aqui muda.
   */
  readonly seedBase?: number
  /**
   * Chamado no fim de cada tick do jogador com o input que a predição acabou
   * de usar. É por aqui que o input sai para o servidor, sem a sessão conhecer
   * a rede: o servidor precisa exatamente do input de cada tick simulado.
   */
  readonly onTick?: (
    movement: Readonly<MutableMovementInput>,
    weapon: Readonly<MutableWeaponInput>,
    aimM: Readonly<Vector3>,
  ) => void
}

export { LOCAL_PLAYER_ID }

/**
 * O dono do passo de tick fixo da arena: o jogador, os bots e o placar, **um
 * acumulador só**.
 *
 * A ordem dentro do tick é a decisão que importa, e é a mesma classe de
 * ambiguidade que `stepCharacter` documenta sobre o `grounded`: **a arma anda
 * antes do corpo**, porque é ela quem decide se a mira está aberta, e o corpo
 * precisa desse valor no mesmo tick para andar na velocidade certa. Rodar na
 * ordem inversa deixaria a mira um tick atrasada — invisível no cliente
 * sozinho, divergência garantida quando o servidor existir. Os bots seguem a
 * mesma ordem, cada um, depois do jogador.
 *
 * ```ts
 * const session = createArenaSession({ config, character, boxes, navGraph, ... })
 * session.advance({ elapsedS, eyeM, aimM })
 * ```
 */
export function createArenaSession(options: ArenaSessionOptions): ArenaSession {
  const parts = createArenaParts(options)
  const names = namesOf(parts.squad)
  const session = {
    character: options.character,
    weapon: parts.weapon,
    melee: parts.melee,
    local: parts.local,
    bots: parts.squad.bots,
    fighters: parts.fighters,
    scoreboard: parts.scoreboard,
    lastMedals: parts.medals as readonly MedalAward[],
    lastKills: parts.kills,
    lastBotShots: parts.tracers,
    ...createSessionClocks(parts.seedBase),
    nameOf: (playerId: string): string => names.get(playerId) ?? playerId.toUpperCase(),
    restartMatch: (rules: MatchRules): void => restartNamed(session, options, parts, names, rules),
    advance: (frame: Readonly<ArenaFrame>): number =>
      advanceArena(session, options, parts, frameForRoom(parts, frame)),
    ...roomMethods((): CombatScope => ({ session, options, parts })),
  }
  return session
}

/** A partida nova, e o nome do jogador local, se a partida trouxe um. */
function restartNamed(
  session: ArenaSessionClocks,
  options: ArenaSessionOptions,
  parts: ArenaParts,
  names: Map<string, string>,
  rules: MatchRules,
): void {
  restartArena(session, options, parts, rules)
  if (rules.callsign !== undefined) names.set(LOCAL_PLAYER_ID, rules.callsign)
}

function createSessionClocks(seedBase: number): ArenaSessionClocks {
  return {
    matchSeed: seedBase,
    lastShot: undefined,
    killedBy: null,
    deathCause: createKillNotice(),
    matchTimeS: 0,
    grappleInReach: false,
    boundaryRemainingS: null,
    boundaryDeaths: 0,
    matchOver: false,
    timed: false,
  }
}

function namesOf(squad: BotSquad): Map<string, string> {
  return new Map([
    [LOCAL_PLAYER_ID, DEFAULT_PROFILE_NAME],
    ...squad.bots.map((bot) => [bot.id, bot.callsign] as const),
  ])
}

/** O que o tick escreve na própria sessão, e que a tela lê. */
export interface ArenaSessionClocks {
  lastShot: Readonly<ShotHit> | undefined
  killedBy: string | null
  readonly deathCause: KillNotice
  matchTimeS: number
  grappleInReach: boolean
  boundaryRemainingS: number | null
  boundaryDeaths: number
  matchOver: boolean
  /** Se esta partida acaba no relógio (`MatchRules.timed`). */
  timed: boolean
  matchSeed: number
}

/**
 * A ordem dentro do tick é a decisão que este módulo protege: **a arma antes do
 * corpo**. Ver o docblock de `createArenaSession`.
 */
function advanceArena(
  session: ArenaSessionClocks,
  options: ArenaSessionOptions,
  parts: ArenaParts,
  frame: Readonly<ArenaFrame>,
): number {
  session.lastShot = undefined
  openFrameLogs(parts)
  parts.frameLogsOpen = false
  const ticks = options.character.pendingTicks(frame.elapsedS)
  const combat: TickCombat = { session, options, parts, frame }
  // o tick em que o relógio zera é o último: os que sobram do quadro são
  // consumidos e descartados, senão o acumulador os guardaria para depois.
  for (let tick = 0; tick < ticks && !session.matchOver; tick += 1) stepArenaTick(combat)
  return ticks
}

/**
 * Um tick, nesta ordem: o jogador (arma, corpo, limite do mapa), ou o relógio
 * dele se estiver morto; depois os bots, cada um com a mesma ordem.
 *
 * A mira do quadro entra na entrada do corpo antes do passo: é para lá que o
 * gancho dispara. O aviso de alcance vem depois, do olho onde o corpo parou.
 */
function stepArenaTick(combat: TickCombat): void {
  const { session, parts } = combat
  if (parts.local.alive) stepLocalPlayer(combat)
  // online o respawn e os outros são da sala: chegam pelo `followRoom`.
  else if (!parts.online) stepLocalRespawn(combat)
  if (!parts.online) stepBots(combat)
  session.matchTimeS += combat.options.character.tickDurationS
  endMatchOnTime(combat)
}

/**
 * O relógio zerou: a partida acaba **neste tick**. Meio tick de folga porque a
 * soma de 18 mil `1/60` não fecha em 300 exatos, e o relógio é cravado em
 * `durationS` — é o zero exato que o marco `match-end` do narrador lê.
 */
function endMatchOnTime(combat: TickCombat): void {
  const { session, options, parts } = combat
  if (!session.timed) return
  const durationS = options.config.match.durationS
  if (session.matchTimeS < durationS - options.character.tickDurationS / 2) return
  session.matchTimeS = durationS
  endMatch(session, options, parts)
}

/**
 * O limite vem **depois do corpo** porque é o pé deste tick que decide se o
 * jogador saiu, e lê-lo antes abriria a contagem um tick atrasada.
 */
function stepLocalPlayer(combat: TickCombat): void {
  const { session, options, parts } = combat
  const { config, character, weaponInput } = options
  Object.assign(parts.local.facingM, combat.frame.aimM)
  stepArsenal(
    parts,
    weaponInput,
    character.current,
    combat.frame.aimM,
    config,
    character.tickDurationS,
  )
  if (parts.weapon.firedThisTick) {
    tryLocalShot(combat)
    session.lastShot = parts.shot
  }
  if (parts.melee.struckThisTick) tryLocalStrike(combat)
  stepLocalBody(combat)
  session.grappleInReach = isGrappleInReach(options, parts)
  enforcePlayArea(session, options, parts)
}

/**
 * O corpo do tick, com o que a arma decidiu, e o input que ele usou para a
 * sala: online, a direção de andar arredondada como o fio a leva.
 */
function stepLocalBody(combat: TickCombat): void {
  const { options, parts, frame } = combat
  const { character, movementInput, weaponInput } = options
  wishForRoom(parts, movementInput)
  armMovementInput(parts, movementInput)
  aimMovementInput(movementInput, frame.aimM)
  // a arma segurando a corrida chega pelo `armMovementInput`, e o shift vai
  // cru: apagá-lo aqui inventava um segundo aperto quando o tiro saía (11/10).
  character.stepOnce(movementInput)
  options.onTick?.(movementInput, weaponInput, frame.aimM)
}

/** A frente da câmera vai para o núcleo como veio: ele normaliza (`grapple.ts`). */
function aimMovementInput(input: MutableMovementInput, aimM: Readonly<Vector3>): void {
  input.aimX = aimM.x
  input.aimY = aimM.y
  input.aimZ = aimM.z
}

/** Solto, sem recarga, e com superfície na mira dentro do alcance. */
function isGrappleInReach(options: ArenaSessionOptions, parts: ArenaParts): boolean {
  const state = options.character.current
  if (state.grappleAttached || state.grappleCooldownLeftS > 0) return false
  const { movementInput, boxes, config } = options
  return findGrappleAnchor(state, movementInput, boxes, config, parts.reachAnchor) !== undefined
}

/**
 * Fora da área, a contagem; prazo vencido, a morte e o spawn seguinte. Quem
 * reaparece recomeça do zero, e por isso a tela recebe `null` no mesmo tick.
 */
function enforcePlayArea(
  session: ArenaSessionClocks,
  options: ArenaSessionOptions,
  parts: ArenaParts,
): void {
  const { character } = options
  const graceS = options.config.match.outOfBoundsGraceS
  const feetM = character.current.position
  const status = stepBoundary(
    parts.boundary,
    options.playArea,
    feetM,
    character.tickDurationS,
    graceS,
  )
  if (status === 'expired') dieOutOfBounds(session, options, parts)
  session.boundaryRemainingS =
    status === 'warning' ? boundaryRemainingS(parts.boundary, graceS) : null
}

/**
 * O prazo venceu: é morte de verdade. Conta no placar e zera a sequência, a
 * arma volta pronta, e o corpo vai ao spawn seguinte.
 */
function dieOutOfBounds(
  session: ArenaSessionClocks,
  options: ArenaSessionOptions,
  parts: ArenaParts,
): void {
  applyBoundaryDeath(parts.scoreboard, LOCAL_PLAYER_ID)
  rearmWeapon(parts.weapon, options.config)
  rearmMelee(parts.melee)
  respawnOutOfBounds(session, options.character, parts.respawns)
}

/**
 * Rodízio pelo número de mortes por limite, e não sorteio: o mesmo caminho dá
 * o mesmo spawn, que é o que o servidor vai precisar para concordar com o
 * cliente (ADR 0003).
 */
function respawnOutOfBounds(
  session: ArenaSessionClocks,
  character: LocalCharacter,
  respawns: readonly Readonly<Vector3>[],
): void {
  // `as` e não `?? respawns[0]`: a lista nunca é vazia (`requireRespawns`) e o
  // índice é tomado módulo o tamanho dela, então o índice sempre existe — e a
  // saída de reserva seria um ramo que teste nenhum alcança.
  const feetM = respawns[session.boundaryDeaths % respawns.length] as Readonly<Vector3>
  session.boundaryDeaths += 1
  character.respawnAt(feetM)
}
