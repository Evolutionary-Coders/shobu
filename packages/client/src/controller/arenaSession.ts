import {
  applyBoundaryDeath,
  applyKill,
  awardMedals,
  type BoundaryClock,
  boundaryRemainingS,
  collectLiveTargets,
  createBoundaryClock,
  createKillEvent,
  createMedalAwards,
  createScoreboard,
  createSeededRandom,
  createShotHit,
  createTargetList,
  createTrainingDummy,
  createWeaponState,
  findGrappleAnchor,
  type GameplayConfig,
  hitHeightRatio,
  killTrainingDummy,
  type MedalAward,
  type MutableKillEvent,
  type PlayArea,
  rearmWeapon,
  resolveShot,
  type Scoreboard,
  type ShotHit,
  type StaticBox,
  spreadTangent,
  stepBoundary,
  stepTrainingDummy,
  stepWeapon,
  type TargetList,
  type TrainingDummy,
  type Vector3,
  type WeaponState,
} from '@shobu/core'
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

export interface ArenaSession {
  readonly character: LocalCharacter
  readonly weapon: Readonly<WeaponState>
  readonly dummies: readonly TrainingDummy[]
  readonly scoreboard: Readonly<Scoreboard>
  /**
   * O tiro deste quadro, ou `undefined`. **Reaproveitado**: vale só até o
   * próximo `advance`, e quem precisar guardar copia.
   */
  readonly lastShot: Readonly<ShotHit> | undefined
  /**
   * As medalhas da kill deste quadro, vazio quando não houve nenhuma.
   * **Reaproveitado**, com o mesmo contrato do `lastShot`.
   */
  readonly lastMedals: readonly MedalAward[]
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
   * Zera o relógio da partida. `matchTimeS` anda desde o **primeiro quadro
   * renderizado**, que é o boot e não a entrada na arena: sem isto, quem fica
   * cinco minutos no menu entra numa partida que o relógio já dá por
   * encerrada — e a música e os marcos do narrador leem esse relógio.
   *
   * Zera só o relógio. O placar sobrevive, porque não existe fim de partida
   * para limpá-lo ainda.
   */
  restartMatch(): void
  advance(frame: Readonly<ArenaFrame>): number
}

export interface ArenaSessionOptions {
  readonly config: GameplayConfig
  readonly character: LocalCharacter
  readonly boxes: readonly StaticBox[]
  readonly dummyPostsM: readonly (readonly [number, number, number])[]
  readonly movementInput: MutableMovementInput
  readonly weaponInput: MutableWeaponInput
  /** Até onde a partida vai. Fora dela, a contagem de `match.outOfBoundsGraceS`. */
  readonly playArea: PlayArea
  /**
   * Onde reaparece quem deixou o prazo vencer, **no pé** e não na convenção de
   * olho dos spawns. Não pode ser vazia.
   */
  readonly respawnFeetM: readonly Readonly<Vector3>[]
  /**
   * A semente base da partida. Hoje é fixa; quando o colyseus entrar ela vem
   * da mensagem de entrada na sala e mais nada aqui muda.
   */
  readonly seedBase?: number
}

/** O id do jogador local no placar. Opaco: amanhã é o sessionId do colyseus. */
export const LOCAL_PLAYER_ID = 'local'
const DEFAULT_SEED_BASE = 20_251_119

/**
 * O dono do passo de tick fixo da arena: arma, corpo, bonecos e placar, **um
 * acumulador só**.
 *
 * A ordem dentro do tick é a decisão que importa, e é a mesma classe de
 * ambiguidade que `stepCharacter` documenta sobre o `grounded`: **a arma anda
 * antes do corpo**, porque é ela quem decide se a mira está aberta, e o corpo
 * precisa desse valor no mesmo tick para andar na velocidade certa. Rodar na
 * ordem inversa deixaria a mira um tick atrasada — invisível no cliente
 * sozinho, divergência garantida quando o servidor existir.
 *
 * ```ts
 * const session = createArenaSession({ config, character, boxes, dummyPostsM, ... })
 * session.advance({ elapsedS, eyeM, aimM })
 * ```
 */
export function createArenaSession(options: ArenaSessionOptions): ArenaSession {
  const parts = createArenaParts(options)
  const session = {
    character: options.character,
    weapon: parts.weapon,
    dummies: parts.dummies,
    scoreboard: parts.scoreboard,
    lastShot: undefined as Readonly<ShotHit> | undefined,
    lastMedals: parts.medals as readonly MedalAward[],
    matchTimeS: 0,
    grappleInReach: false,
    boundaryRemainingS: null as number | null,
    boundaryDeaths: 0,
    restartMatch: (): void => {
      session.matchTimeS = 0
      // a contagem fora da área não atravessa partidas: a nova começaria com
      // um prazo já gasto (revisão do PR #16).
      parts.boundary.outsideS = 0
      session.boundaryRemainingS = null
    },
    advance: (frame: Readonly<ArenaFrame>): number => advanceArena(session, options, parts, frame),
  }
  return session
}

/** O que o tick escreve na própria sessão, e que a tela lê. */
interface ArenaSessionClocks {
  lastShot: Readonly<ShotHit> | undefined
  matchTimeS: number
  grappleInReach: boolean
  boundaryRemainingS: number | null
  boundaryDeaths: number
}

/**
 * O estado que o tick muta, junto e nomeado, para o passo ser **função de
 * módulo** e não closure: closure de 60 linhas é o que fazia esta raiz crescer,
 * e função nomeada é o que deixa cada pedaço aparecer na conta de cobertura.
 */
interface ArenaParts {
  readonly weapon: WeaponState
  readonly dummies: readonly TrainingDummy[]
  readonly scoreboard: Scoreboard
  readonly targets: TargetList
  readonly shot: ShotHit
  readonly kill: MutableKillEvent
  readonly medals: MedalAward[]
  /** A tangente do cone sai uma vez por carga de config, nunca por tiro. */
  readonly coneTangent: number
  readonly seedBase: number
  readonly boundary: BoundaryClock
  /** Nunca vazia: `requireRespawns` recusa a lista vazia na criação. */
  readonly respawns: readonly Readonly<Vector3>[]
  /** Onde o aviso da retícula achou superfície. Rascunho: só o sim ou não importa. */
  readonly reachAnchor: Vector3
}

function createArenaParts(options: ArenaSessionOptions): ArenaParts {
  const dummies = options.dummyPostsM.map((post, index) =>
    createTrainingDummy(`dummy-${index}`, feetOf(post, options.config)),
  )
  return {
    weapon: createWeaponState(options.config),
    dummies,
    scoreboard: createScoreboard(),
    targets: createTargetList(Math.max(1, dummies.length)),
    shot: createShotHit(),
    kill: createKillEvent(),
    medals: createMedalAwards(),
    coneTangent: spreadTangent(options.config.weapon.noScopeSpreadDeg),
    seedBase: options.seedBase ?? DEFAULT_SEED_BASE,
    boundary: createBoundaryClock(),
    respawns: requireRespawns(options.respawnFeetM),
    reachAnchor: { x: 0, y: 0, z: 0 },
  }
}

/** Sem spawn, a primeira saída do mapa não teria para onde mandar o jogador. */
function requireRespawns(respawnFeetM: readonly Readonly<Vector3>[]): readonly Readonly<Vector3>[] {
  if (respawnFeetM.length === 0) {
    throw new RangeError('respawnFeetM recebeu []; esperado pelo menos um pé de spawn {x, y, z}')
  }
  return respawnFeetM
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
  const ticks = options.character.pendingTicks(frame.elapsedS)
  for (let tick = 0; tick < ticks; tick += 1) stepArenaTick(session, options, parts, frame)
  return ticks
}

/**
 * Um tick, nesta ordem: arma, corpo, limite do mapa, bonecos. O limite vem
 * **depois do corpo** porque é o pé deste tick que decide se o jogador saiu, e
 * lê-lo antes abriria a contagem um tick atrasada.
 *
 * A mira do quadro entra na entrada do corpo antes do passo: é para lá que o
 * gancho dispara. O aviso de alcance vem depois, do olho onde o corpo parou.
 */
function stepArenaTick(
  session: ArenaSessionClocks,
  options: ArenaSessionOptions,
  parts: ArenaParts,
  frame: Readonly<ArenaFrame>,
): void {
  const { config, character, movementInput, weaponInput } = options
  stepWeapon(parts.weapon, weaponInput, config, character.tickDurationS)
  if (parts.weapon.firedThisTick) {
    fireAndScore(options, parts, frame, session.matchTimeS)
    session.lastShot = parts.shot
  }
  movementInput.scoped = parts.weapon.scoped
  aimMovementInput(movementInput, frame.aimM)
  character.stepOnce(movementInput)
  session.grappleInReach = isGrappleInReach(options, parts)
  enforcePlayArea(session, options, parts)
  for (const dummy of parts.dummies) stepTrainingDummy(dummy, character.tickDurationS)
  session.matchTimeS += character.tickDurationS
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

/**
 * O contador de tiros **é** a identidade do tiro: semeia a dispersão e nomeia
 * o rastro. Quando o servidor existir, `seedBase` vem dele e o cliente chega
 * ao mesmo cone sem mais nenhuma mudança.
 */
function fireAndScore(
  options: ArenaSessionOptions,
  parts: ArenaParts,
  frame: Readonly<ArenaFrame>,
  atS: number,
): void {
  const { config } = options
  collectLiveTargets(parts.dummies, config, parts.targets)
  resolveShot(
    {
      originM: frame.eyeM,
      aimM: frame.aimM,
      exact: parts.weapon.firedExact,
      spreadTangent: parts.coneTangent,
      maxDistanceM: config.weapon.hitscanRangeM,
    },
    options.boxes,
    parts.targets,
    createSeededRandom(parts.seedBase ^ parts.weapon.shotsFired),
    parts.shot,
  )
  // `find` e não indexar por número: o tiro na parede traz -1, e nenhuma posição
  // é -1, então **uma guarda só** cobre "errou" e "índice fora da lista". As
  // duas saídas dela são exercidas — indexar exigiria uma segunda guarda cuja
  // saída de erro nenhum teste alcança.
  //
  // Sem checar `alive` de novo: `collectLiveTargets` só enfileira boneco vivo,
  // e o tiro é resolvido no mesmo tick em que a lista foi montada.
  const victim = parts.dummies.find((_dummy, index) => index === parts.shot.targetIndex)
  if (!victim) return
  killTrainingDummy(victim, config.match.respawnDelayS)
  const kill = describeKill(parts, options.character, victim, atS, config.collision.capsuleHeightM)
  // as medalhas antes da kill: as condições leem a sequência da vítima, a
  // contagem da partida e a janela de multikill, e `applyKill` muda as três.
  awardMedals(parts.scoreboard, kill, config.medals, parts.medals)
  applyKill(parts.scoreboard, kill, config.match.pointsPerKill)
}

function describeKill(
  parts: ArenaParts,
  character: LocalCharacter,
  victim: TrainingDummy,
  atS: number,
  capsuleHeightM: number,
): MutableKillEvent {
  const into = parts.kill
  into.shooterId = LOCAL_PLAYER_ID
  into.victimId = victim.id
  into.atS = atS
  into.weapon = 'sniper'
  into.scoped = parts.weapon.firedScoped
  into.distanceM = parts.shot.distanceM
  into.shooterAirborne = !character.current.grounded
  // o estado de antes do passo do corpo: a arma anda primeiro no tick, e é
  // nesse instante que o tiro sai (ver `stepArenaTick`).
  into.shooterGrappling = character.current.grappleAttached
  into.hitHeightRatio = hitHeightRatio(parts.shot.endpointM, victim.feetM, capsuleHeightM)
  describeMissingMechanics(into)
  return into
}

/**
 * Os campos cuja mecânica ainda não existe, todos no valor neutro. Ficam numa
 * função só, e não espalhados por `describeKill`, para a lista do que falta
 * ser legível de uma vez — `killEvent.ts` diz o que destrava cada um.
 */
function describeMissingMechanics(into: MutableKillEvent): void {
  into.victimAirborne = false
  into.shooterYawTurnDeg = 0
  into.victimFacingAwayDeg = 0
  into.victimsInShot = 1
}

/** Os postes estão na convenção de olho dos spawns; o núcleo trabalha com o pé. */
function feetOf(
  postM: readonly [number, number, number],
  config: GameplayConfig,
): Readonly<Vector3> {
  return { x: postM[0], y: postM[1] - config.collision.capsuleHeightM, z: postM[2] }
}
