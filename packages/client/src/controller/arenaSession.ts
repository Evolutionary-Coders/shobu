import {
  applyKill,
  collectLiveTargets,
  createKillEvent,
  createScoreboard,
  createSeededRandom,
  createShotHit,
  createTargetList,
  createTrainingDummy,
  createWeaponState,
  type GameplayConfig,
  killTrainingDummy,
  type MutableKillEvent,
  resolveShot,
  type Scoreboard,
  type ShotHit,
  type StaticBox,
  spreadTangent,
  stepTrainingDummy,
  stepWeapon,
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
  /** Segundos de partida já simulados. É o `atS` do evento de kill. */
  readonly matchTimeS: number
  advance(frame: Readonly<ArenaFrame>): number
}

export interface ArenaSessionOptions {
  readonly config: GameplayConfig
  readonly character: LocalCharacter
  readonly boxes: readonly StaticBox[]
  readonly dummyPostsM: readonly (readonly [number, number, number])[]
  readonly movementInput: MutableMovementInput
  readonly weaponInput: MutableWeaponInput
  /**
   * A semente base da partida. Hoje é fixa; quando o colyseus entrar ela vem
   * da mensagem de entrada na sala e mais nada aqui muda.
   */
  readonly seedBase?: number
}

const LOCAL_PLAYER_ID = 'local'
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
  const { config, character, movementInput, weaponInput } = options
  const weapon = createWeaponState(config)
  const dummies = options.dummyPostsM.map((post, index) =>
    createTrainingDummy(`dummy-${index}`, feetOf(post, config)),
  )
  const scoreboard = createScoreboard()
  const targets = createTargetList(Math.max(1, dummies.length))
  const shot = createShotHit()
  const kill = createKillEvent()
  // a tangente do cone sai uma vez por carga de config, nunca por tiro.
  const coneTangent = spreadTangent(config.weapon.noScopeSpreadDeg)
  const seedBase = options.seedBase ?? DEFAULT_SEED_BASE
  const session = {
    character,
    weapon,
    dummies,
    scoreboard,
    lastShot: undefined as Readonly<ShotHit> | undefined,
    matchTimeS: 0,
    advance: (frame: Readonly<ArenaFrame>): number => {
      session.lastShot = undefined
      const ticks = character.pendingTicks(frame.elapsedS)
      for (let tick = 0; tick < ticks; tick += 1) {
        stepWeapon(weapon, weaponInput, config, character.tickDurationS)
        if (weapon.firedThisTick) {
          fireAndScore(frame)
          session.lastShot = shot
        }
        movementInput.scoped = weapon.scoped
        character.stepOnce(movementInput)
        for (const dummy of dummies) stepTrainingDummy(dummy, character.tickDurationS)
        session.matchTimeS += character.tickDurationS
      }
      return ticks
    },
  }

  /**
   * O contador de tiros **é** a identidade do tiro: semeia a dispersão e nomeia
   * o rastro. Quando o servidor existir, `seedBase` vem dele e o cliente chega
   * ao mesmo cone sem mais nenhuma mudança.
   */
  function fireAndScore(frame: Readonly<ArenaFrame>): void {
    collectLiveTargets(dummies, config, targets)
    resolveShot(
      {
        originM: frame.eyeM,
        aimM: frame.aimM,
        exact: weapon.firedExact,
        spreadTangent: coneTangent,
        maxDistanceM: config.weapon.hitscanRangeM,
      },
      options.boxes,
      targets,
      createSeededRandom(seedBase ^ weapon.shotsFired),
      shot,
    )
    if (shot.targetIndex < 0) return
    const victim = dummies[shot.targetIndex]
    if (!victim?.alive) return
    killTrainingDummy(victim, config.match.respawnDelayS)
    applyKill(scoreboard, describeKill(kill, victim, shot), config.match.pointsPerKill)
  }

  function describeKill(
    into: MutableKillEvent,
    victim: TrainingDummy,
    hit: Readonly<ShotHit>,
  ): MutableKillEvent {
    into.shooterId = LOCAL_PLAYER_ID
    into.victimId = victim.id
    into.atS = session.matchTimeS
    into.weapon = 'sniper'
    into.scoped = weapon.firedScoped
    into.distanceM = hit.distanceM
    into.shooterAirborne = !character.current.grounded
    // o boneco não pula e o gancho ainda não existe.
    into.victimAirborne = false
    into.shooterGrappling = false
    return into
  }

  return session
}

/** Os postes estão na convenção de olho dos spawns; o núcleo trabalha com o pé. */
function feetOf(
  postM: readonly [number, number, number],
  config: GameplayConfig,
): Readonly<Vector3> {
  return { x: postM[0], y: postM[1] - config.collision.capsuleHeightM, z: postM[2] }
}
