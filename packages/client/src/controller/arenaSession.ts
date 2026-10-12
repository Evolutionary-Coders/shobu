import {
  addPlayer,
  applyBoundaryDeath,
  armMovementInput,
  type BotDifficulty,
  type BotPlayer,
  type BotSquad,
  boundaryRemainingS,
  type Fighter,
  findGrappleAnchor,
  type GameplayConfig,
  isBenched,
  type MedalAward,
  type MeleeState,
  type MeleeWeapon,
  type NavGraph,
  type PlayArea,
  rearmMelee,
  rearmWeapon,
  removePlayer,
  type Scoreboard,
  type ShotHit,
  type StaticBox,
  seatBots,
  setBotDifficulty,
  stepArsenal,
  stepBoundary,
  type Vector3,
  type WeaponState,
} from '@shobu/core'
import {
  stepBots,
  stepLocalRespawn,
  type TickCombat,
  tryLocalShot,
  tryLocalStrike,
} from './arenaCombat.ts'
import type { BotTracer, FrameLog, KillNotice } from './arenaFrameLog.ts'
import { type ArenaParts, createArenaParts, LOCAL_PLAYER_ID } from './arenaParts.ts'
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
  /** O nome de um id do placar: `VOCÊ` para o jogador local, o apelido para um bot. */
  nameOf(playerId: string): string
  /**
   * Zera o relógio da partida e aplica as regras do modo. `matchTimeS` anda
   * desde o **primeiro quadro simulado**: sem isto, quem fica no menu entra
   * numa partida que o relógio já dá por encerrada — e a música e os marcos
   * do narrador leem esse relógio.
   *
   * Zera só o relógio. O placar sobrevive, porque não existe fim de partida
   * para limpá-lo ainda.
   */
  restartMatch(rules: MatchRules): void
  advance(frame: Readonly<ArenaFrame>): number
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
}

export { LOCAL_PLAYER_ID }
/** Como o killfeed e o placar chamam o jogador local. */
export const LOCAL_PLAYER_NAME = 'VOCÊ'

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
    ...createSessionClocks(),
    nameOf: (playerId: string): string => names.get(playerId) ?? playerId.toUpperCase(),
    restartMatch: (rules: MatchRules): void => restartMatch(session, options, parts, rules),
    advance: (frame: Readonly<ArenaFrame>): number => advanceArena(session, options, parts, frame),
  }
  return session
}

function createSessionClocks(): ArenaSessionClocks {
  return {
    lastShot: undefined,
    killedBy: null,
    matchTimeS: 0,
    grappleInReach: false,
    boundaryRemainingS: null,
    boundaryDeaths: 0,
  }
}

function restartMatch(
  session: ArenaSessionClocks,
  options: ArenaSessionOptions,
  parts: ArenaParts,
  rules: MatchRules,
): void {
  session.matchTimeS = 0
  // a contagem fora da área não atravessa partidas: a nova começaria com um
  // prazo já gasto (revisão do PR #16).
  parts.boundary.outsideS = 0
  session.boundaryRemainingS = null
  parts.squad.hostile = rules.hostileBots
  setBotDifficulty(parts.squad, options.config, rules.botDifficulty)
  seatBotsOnTheBoard(parts, options.config, rules.botCount)
  // a classe vale a partir da entrada: a arma de corpo a corpo troca, e a
  // sniper volta à mão.
  parts.melee.weapon = rules.meleeWeapon
  rearmMelee(parts.melee)
}

/**
 * Senta os bots da contagem e tira do placar os que foram para o banco: o tab
 * não mostra quem não está na sala. Quem volta do banco entra no fim do placar.
 */
function seatBotsOnTheBoard(parts: ArenaParts, config: GameplayConfig, count: number): void {
  seatBots(parts.squad, parts.fighters, count, config)
  for (const bot of parts.squad.bots) {
    if (isBenched(bot)) removePlayer(parts.scoreboard, bot.id)
    else addPlayer(parts.scoreboard, bot.id)
  }
}

function namesOf(squad: BotSquad): ReadonlyMap<string, string> {
  return new Map([
    [LOCAL_PLAYER_ID, LOCAL_PLAYER_NAME],
    ...squad.bots.map((bot) => [bot.id, bot.callsign] as const),
  ])
}

/** O que o tick escreve na própria sessão, e que a tela lê. */
export interface ArenaSessionClocks {
  lastShot: Readonly<ShotHit> | undefined
  killedBy: string | null
  matchTimeS: number
  grappleInReach: boolean
  boundaryRemainingS: number | null
  boundaryDeaths: number
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
  parts.medals.length = 0
  parts.kills.count = 0
  parts.tracers.count = 0
  const ticks = options.character.pendingTicks(frame.elapsedS)
  const combat: TickCombat = { session, options, parts, frame }
  for (let tick = 0; tick < ticks; tick += 1) stepArenaTick(combat)
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
  else stepLocalRespawn(combat)
  stepBots(combat)
  session.matchTimeS += combat.options.character.tickDurationS
}

/**
 * O limite vem **depois do corpo** porque é o pé deste tick que decide se o
 * jogador saiu, e lê-lo antes abriria a contagem um tick atrasada.
 */
function stepLocalPlayer(combat: TickCombat): void {
  const { session, options, parts } = combat
  const { config, character, movementInput, weaponInput } = options
  Object.assign(parts.local.facingM, combat.frame.aimM)
  stepArsenal(parts, weaponInput, character.current, config, character.tickDurationS)
  if (parts.weapon.firedThisTick) {
    tryLocalShot(combat)
    session.lastShot = parts.shot
  }
  if (parts.melee.struckThisTick) tryLocalStrike(combat)
  armMovementInput(parts, movementInput)
  aimMovementInput(movementInput, combat.frame.aimM)
  // a arma segurando a corrida chega pelo `armMovementInput`, e o shift vai
  // cru: apagá-lo aqui inventava um segundo aperto quando o tiro saía (11/10).
  character.stepOnce(movementInput)
  session.grappleInReach = isGrappleInReach(options, parts)
  enforcePlayArea(session, options, parts)
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
