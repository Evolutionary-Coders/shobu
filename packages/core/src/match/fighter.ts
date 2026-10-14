import { pushTarget, resetTargetList, type TargetList } from '../collision/targetList.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { nextUnit, type SeededRandom } from '../math/seededRandom.ts'
import type { Vector3 } from '../math/vector3.ts'
import type { CharacterState } from '../movement/characterState.ts'

/**
 * Quem está na arena e pode atirar e morrer: o jogador local, um jogador da
 * sala ou um bot. É o que o código de tiro e de kill enxerga — e por isso ele
 * nunca soube a diferença entre os três (ADR 0016).
 *
 * O corpo é o `CharacterState` do núcleo, o mesmo que `stepCharacter` anda: a
 * cápsula que se atinge é a que colide, e encolhe agachado do mesmo jeito.
 */
export interface Fighter {
  /** Opaco: `local`, `bot-2`, e amanhã o `sessionId` do colyseus. */
  readonly id: string
  readonly body: Readonly<CharacterState>
  /**
   * Para onde ele olha, em mundo, não necessariamente unitário: o `aimM` do
   * bot, a câmera do jogador. É o que o `backstab` compara com a direção do
   * golpe (ADR 0021).
   */
  readonly facingM: Readonly<Vector3>
  alive: boolean
  /** Segundos até reaparecer. Só vale com `alive` falso. */
  respawnLeftS: number
}

/**
 * Enfileira os vivos, menos o atirador, como alvos do tiro. `sourceIndex` é o
 * índice em `fighters`, então o acerto devolve direto quem morreu.
 *
 * A altura é a da cápsula **agora** — agachado e no slide ela é menor, e tiro
 * que passa por cima de quem deslizou é a mecânica funcionando.
 *
 * ```ts
 * resolveShot(shot, boxes, collectFighterTargets(fighters, 0, config, targets), rng, hit)
 * ```
 */
export function collectFighterTargets(
  fighters: readonly Fighter[],
  shooterIndex: number,
  config: GameplayConfig,
  into: TargetList,
): TargetList {
  resetTargetList(into)
  const radiusM = config.collision.capsuleRadiusM
  for (const [index, fighter] of fighters.entries()) {
    if (index === shooterIndex || !fighter.alive) continue
    pushTarget(into, index, fighter.body.position, radiusM, fighter.body.capsuleHeightM)
  }
  return into
}

/**
 * Mata e arma o respawn. Devolve se matou: matar quem já está morto não
 * reinicia o cronômetro, e dois tiros no mesmo tick não contam duas kills.
 *
 * ```ts
 * if (killFighter(victim, config.match.respawnDelayS)) recordKill(...)
 * ```
 */
export function killFighter(fighter: Fighter, respawnDelayS: number): boolean {
  if (!fighter.alive) return false
  fighter.alive = false
  fighter.respawnLeftS = respawnDelayS
  return true
}

/**
 * Um tick do relógio de quem está morto. Devolve verdadeiro **no tick** em que
 * ele zera: é quando quem chamou põe o corpo num spawn. Volta vivo aqui mesmo,
 * para ninguém esquecer de ressuscitar depois de mover.
 */
export function stepRespawnClock(fighter: Fighter, dtS: number): boolean {
  if (fighter.alive) return false
  fighter.respawnLeftS = Math.max(0, fighter.respawnLeftS - dtS)
  if (fighter.respawnLeftS > 0) return false
  fighter.alive = true
  return true
}

/**
 * Perto disto de alguém vivo, o spawn está ocupado. Não é proteção de spawn,
 * que o pilar 1 proíbe — é não nascer **dentro** de outro corpo, já que corpos
 * não colidem entre si.
 */
const SPAWN_CLEARANCE_M = 3

/**
 * O spawn de quem reaparece: sorteado, como o GDD manda, entre os que não têm
 * ninguém vivo em cima. Sem nenhum livre, qualquer um serve.
 *
 * Sorteio pelo gerador da partida, nunca por `Math.random`: o servidor tem que
 * chegar ao mesmo spawn (ADR 0003).
 *
 * ```ts
 * const feetM = spawns[pickSpawn(spawns, fighters, rng)]
 * ```
 */
export function pickSpawn(
  spawnsFeetM: readonly Readonly<Vector3>[],
  fighters: readonly Fighter[],
  rng: SeededRandom,
): number {
  if (spawnsFeetM.length === 0) {
    throw new RangeError('pickSpawn recebeu spawnsFeetM []; esperado ao menos um pé de spawn')
  }
  const start = Math.floor(nextUnit(rng) * spawnsFeetM.length)
  for (let offset = 0; offset < spawnsFeetM.length; offset += 1) {
    const index = (start + offset) % spawnsFeetM.length
    if (isFree(spawnsFeetM[index] as Readonly<Vector3>, fighters)) return index
  }
  return start
}

function isFree(feetM: Readonly<Vector3>, fighters: readonly Fighter[]): boolean {
  for (const fighter of fighters) {
    if (!fighter.alive) continue
    const dx = fighter.body.position.x - feetM.x
    const dy = fighter.body.position.y - feetM.y
    const dz = fighter.body.position.z - feetM.z
    if (dx * dx + dy * dy + dz * dz < SPAWN_CLEARANCE_M * SPAWN_CLEARANCE_M) return false
  }
  return true
}
