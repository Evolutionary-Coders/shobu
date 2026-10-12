import type { StaticBox } from '../collision/staticBox.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { eyeOf, type Fighter, pickSpawn } from '../match/fighter.ts'
import { createSeededRandom, nextUnit, type SeededRandom } from '../math/seededRandom.ts'
import type { Vector3 } from '../math/vector3.ts'
import { armMovementInput, stepArsenal } from '../melee/stepArsenal.ts'
import { copyCharacterState } from '../movement/characterState.ts'
import { stepCharacter } from '../movement/stepCharacter.ts'
import {
  aimAlongStride,
  aimAtFoe,
  type BotHand,
  botHandFor,
  pullTriggers,
  rerollAimAfterShot,
  steadyOnNewTarget,
  type TriggerSight,
  trackKnifeReach,
} from './botAim.ts'
import { botCallsigns } from './botCallsigns.ts'
import { routeTo, walkRoute } from './botLocomotion.ts'
import { type BotPlayer, createBotPlayer, resetBotBody } from './botPlayer.ts'
import { createBotView, lookAround, type MutableBotView } from './botSenses.ts'
import { type BotDifficulty, botSkillFor } from './botSkill.ts'
import { type NavGraph, nearestNavNode } from './navGraph.ts'

/**
 * Os bots de uma sala e o que eles dividem: a arena, o gerador da sala e a
 * regra do modo. É o que o cliente roda sozinho hoje e o servidor roda amanhã,
 * com a mesma chamada por tick (ADR 0016).
 */
export interface BotSquad {
  readonly bots: readonly BotPlayer[]
  readonly arena: BotArena
  /** O nível escolhido no menu, com as tangentes dele. Troca com `setBotDifficulty`. */
  hand: BotHand
  /** Spawns e destinos. Um gerador da sala, e não por bot: a ordem dos sorteios é a do tick. */
  readonly rng: SeededRandom
  /** O olhar reaproveitado, preenchido pelo bot da vez. */
  readonly view: MutableBotView
  /**
   * No treino os bots andam e não atiram: alvo que se move e não pune. Na
   * partida, atiram em todo mundo — inclusive uns nos outros, que é FFA.
   */
  hostile: boolean
}

/** A arena como o bot a conhece: as caixas, o grafo e onde se nasce. */
export interface BotArena {
  readonly boxes: readonly StaticBox[]
  readonly graph: NavGraph
  /** Os spawns, **no pé**. */
  readonly spawnsFeetM: readonly Readonly<Vector3>[]
}

export interface BotSquadOptions {
  readonly count: number
  readonly seed: number
  readonly arena: BotArena
  readonly config: GameplayConfig
  /** O nível da sala. Sem ele, o normal. */
  readonly difficulty?: BotDifficulty
}

/**
 * Cria os bots, cada um com nome, semente e um spawn só seu.
 *
 * ```ts
 * const squad = createBotSquad({ count: botSeatsFor(config.match.playersPerRoom, 1), seed, arena, config })
 * ```
 */
export function createBotSquad(options: BotSquadOptions): BotSquad {
  const { seed, arena, config } = options
  const squad: BotSquad = {
    bots: enlistBots(options),
    arena,
    hand: botHandFor(botSkillFor(config, options.difficulty ?? 'normal')),
    rng: createSeededRandom(seed),
    view: createBotView(arena.boxes, config.bots.sightRangeM),
    hostile: true,
  }
  // mortos até cada um ser posto: o spawn do segundo evita o do primeiro.
  for (const bot of squad.bots) bot.alive = false
  for (const bot of squad.bots) placeBot(squad, bot, squad.bots, config)
  return squad
}

/**
 * Troca o nível dos bots no meio da sala: vale do próximo tick em diante. Aloca
 * as tangentes novas, e só aqui — é gesto do menu, fora do caminho quente.
 *
 * ```ts
 * setBotDifficulty(squad, config, 'hard')
 * ```
 */
export function setBotDifficulty(
  squad: BotSquad,
  config: GameplayConfig,
  difficulty: BotDifficulty,
): void {
  squad.hand = botHandFor(botSkillFor(config, difficulty))
}

/**
 * Quantos bots jogam: os primeiros `count` ficam (ou voltam) na arena, e os
 * outros saem do banco de reservas — mortos, com o respawn em infinito, então
 * nem reaparecem, nem são alvo, nem ocupam spawn. É o BOTS do menu de nova
 * partida; a sala continua criada com as vagas todas, para trocar a contagem
 * sem recriar a sessão.
 *
 * ```ts
 * seatBots(squad, fighters, 1, config) // um bot só na arena
 * ```
 */
export function seatBots(
  squad: BotSquad,
  fighters: readonly Fighter[],
  count: number,
  config: GameplayConfig,
): void {
  for (const [index, bot] of squad.bots.entries()) {
    if (index >= count) benchBot(bot)
    else if (isBenched(bot)) placeBot(squad, bot, fighters, config)
  }
}

function benchBot(bot: BotPlayer): void {
  bot.alive = false
  bot.respawnLeftS = Number.POSITIVE_INFINITY
}

/**
 * Fora da partida pelo `seatBots`, e não só morto esperando o respawn.
 *
 * ```ts
 * if (isBenched(bot)) avatar.setEnabled(false)
 * ```
 */
export function isBenched(bot: Readonly<BotPlayer>): boolean {
  return !bot.alive && bot.respawnLeftS === Number.POSITIVE_INFINITY
}

/** Os bots com nome e semente, ainda sem lugar: quem os põe na arena é `placeBot`. */
function enlistBots(options: BotSquadOptions): readonly BotPlayer[] {
  const { count, seed, arena, config } = options
  const firstFeetM = arena.spawnsFeetM[0]
  if (!firstFeetM) {
    throw new RangeError('createBotSquad recebeu spawnsFeetM []; esperado ao menos um pé de spawn')
  }
  return botCallsigns(count, seed).map((callsign, index) =>
    createBotPlayer(
      { id: `bot-${index}`, callsign, seed: seed + index + 1 },
      firstFeetM,
      arena.graph,
      config,
    ),
  )
}

/**
 * Põe o bot num spawn sorteado, vivo, e lhe dá um destino. Serve ao
 * nascimento e a todo respawn.
 *
 * ```ts
 * if (stepRespawnClock(bot, dtS)) placeBot(squad, bot, fighters, config)
 * ```
 */
export function placeBot(
  squad: BotSquad,
  bot: BotPlayer,
  fighters: readonly Fighter[],
  config: GameplayConfig,
): void {
  const { spawnsFeetM } = squad.arena
  const feetM = spawnsFeetM[pickSpawn(spawnsFeetM, fighters, squad.rng)] as Readonly<Vector3>
  resetBotBody(bot, feetM, config)
  bot.alive = true
  bot.respawnLeftS = 0
  headSomewhere(squad, bot)
}

/**
 * Um destino sorteado entre os nós que não são o de agora, e a rota até ele.
 * Com um nó só não há outro: a rota vai do nó ao próprio nó, e o bot fica
 * parado — o sorteio caía no nó 1, que não existe (revisão do núcleo).
 */
function headSomewhere(squad: BotSquad, bot: BotPlayer): void {
  const { graph } = squad.arena
  const here = nearestNavNode(graph, bot.body.position)
  if (graph.nodes.length < 2) {
    routeTo(bot.locomotion, graph, here, here)
    return
  }
  const pick = Math.floor(nextUnit(squad.rng) * (graph.nodes.length - 1))
  const destination = pick >= here ? pick + 1 : pick
  routeTo(bot.locomotion, graph, here, destination)
}

/** O que o tick de um bot lê, além dele mesmo. */
export interface BotTick {
  readonly squad: BotSquad
  /** Todo mundo na arena, bots inclusive. O bot de índice `i` em `squad.bots` não precisa estar em `i`. */
  readonly fighters: readonly Fighter[]
  readonly config: GameplayConfig
  readonly dtS: number
}

/**
 * Olhos, mira e arma, nesta ordem, e devolve se a arma disparou. **Antes do
 * corpo**, como o jogador (`arenaSession.ts`): é a arma que decide se a
 * luneta está aberta, e o corpo anda na velocidade dela no mesmo tick.
 *
 * Quem resolve o tiro é quem chamou, com `resolveFighterShot` — o mesmo
 * caminho do tiro do jogador. O golpe de faca sai no mesmo passo
 * (`stepArsenal`), e quem chamou lê `bot.melee.struckThisTick` e o resolve com
 * `resolveFighterStrike`.
 *
 * ```ts
 * if (aimAndTrigger(bot, selfIndex, tick)) resolveFighterShot({ shooterIndex: selfIndex, ... })
 * ```
 */
export function aimAndTrigger(bot: BotPlayer, selfIndex: number, tick: BotTick): boolean {
  const { squad, fighters, config } = tick
  eyeOf(bot.body, bot.eyeM)
  if (
    squad.hostile &&
    lookAround(bot.mind, lookingFrom(squad.view, bot, selfIndex, fighters), tick.dtS)
  )
    steadyOnNewTarget(bot, squad.hand.skill)
  const foe = engagedFoe(bot, tick)
  const distanceM = foe ? aimAtFoe(bot, foe, squad.hand, config) : Number.POSITIVE_INFINITY
  if (!foe) aimAlongStride(bot)
  trackKnifeReach(bot, distanceM, config, tick.dtS)
  TRIGGER_SIGHT.distanceM = distanceM
  TRIGGER_SIGHT.hostile = squad.hostile
  TRIGGER_SIGHT.meleeReactionS = squad.hand.skill.meleeReactionS
  pullTriggers(bot, TRIGGER_SIGHT, config)
  stepArsenal(bot, bot.weaponInput, bot.body, bot.aimM, config, tick.dtS)
  if (bot.weapon.firedThisTick) rerollAimAfterShot(bot)
  return bot.weapon.firedThisTick
}

/**
 * O que a mão vê, reaproveitado: um literal por bot por tick era alocação no
 * caminho quente (revisão do núcleo). Um só basta porque `pullTriggers` o lê
 * inteiro e não o guarda, e cada bot o reescreve inteiro antes.
 */
const TRIGGER_SIGHT: { -readonly [Key in keyof TriggerSight]: TriggerSight[Key] } = {
  distanceM: Number.POSITIVE_INFINITY,
  hostile: false,
  meleeReactionS: 0,
}

/** O alvo com quem o bot troca tiro, ou nada — e nada sempre, fora do modo hostil. */
function engagedFoe(bot: BotPlayer, tick: BotTick): Fighter | undefined {
  return tick.squad.hostile ? tick.fighters[bot.mind.targetIndex] : undefined
}

function lookingFrom(
  view: MutableBotView,
  bot: BotPlayer,
  selfIndex: number,
  fighters: readonly Fighter[],
): MutableBotView {
  view.eyeM = bot.eyeM
  view.selfIndex = selfIndex
  view.fighters = fighters
  return view
}

/**
 * Pernas e corpo, depois do tiro. Quem troca tiro dá passo lateral; quem não
 * troca segue a rota, e ao fim dela escolhe outra. Preso, o bot primeiro pula
 * e depois desiste do trecho e replaneja a partir do nó mais perto.
 *
 * ```ts
 * moveBot(bot, tick)
 * ```
 */
export function moveBot(bot: BotPlayer, tick: BotTick): void {
  const { squad, config, dtS } = tick
  const foe = engagedFoe(bot, tick)
  if (foe) strafeAround(bot, foe, config, dtS)
  else followRoute(squad, bot, config, dtS)
  armMovementInput(bot, bot.movementInput)
  copyCharacterState(bot.body, bot.previousBody)
  stepCharacter(bot.body, bot.movementInput, squad.arena.boxes, config, dtS)
}

function followRoute(squad: BotSquad, bot: BotPlayer, config: GameplayConfig, dtS: number): void {
  const { graph } = squad.arena
  const status = walkRoute(bot.locomotion, bot.body, graph, config.bots, bot.movementInput, dtS)
  if (status === 'arrived') headSomewhere(squad, bot)
  if (status !== 'stuck') return
  // a primeira tentativa é a do jogador: pular. a segunda é desistir do trecho.
  if (bot.locomotion.stuckCount === 1) bot.movementInput.jump = !bot.body.jumpWasHeld
  else headSomewhere(squad, bot)
}

/**
 * O passo lateral de quem troca tiro: perpendicular à linha até o alvo, e o
 * lado troca a cada `bots.strafeSwitchS`, com um sorteio de ±40 % para o
 * ritmo não ser um metrônomo que o jogador aprende.
 */
function strafeAround(bot: BotPlayer, foe: Fighter, config: GameplayConfig, dtS: number): void {
  const { mind, movementInput } = bot
  mind.strafeLeftS -= dtS
  if (mind.strafeLeftS <= 0) {
    mind.strafeSign = -mind.strafeSign
    mind.strafeLeftS = config.bots.strafeSwitchS * (0.6 + 0.8 * nextUnit(bot.rng))
  }
  const dx = foe.body.position.x - bot.body.position.x
  const dz = foe.body.position.z - bot.body.position.z
  const length = Math.sqrt(dx * dx + dz * dz) || 1
  movementInput.wishX = (-dz / length) * mind.strafeSign
  movementInput.wishZ = (dx / length) * mind.strafeSign
  movementInput.sprint = false
  movementInput.jump = false
  movementInput.crouch = false
}
