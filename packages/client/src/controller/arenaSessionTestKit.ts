import { readFileSync } from 'node:fs'
import {
  boxFromCenterSize,
  createNavGraph,
  type GameplayConfig,
  type PlayArea,
  parseGameplayConfig,
  type ShotHit,
  type StaticBox,
  type Vector3,
} from '@shobu/core'
import { type ArenaFrame, type ArenaSession, createArenaSession } from './arenaSession.ts'
import { createLocalCharacter } from './localCharacter.ts'
import { createWeaponInput, type MutableWeaponInput } from './weaponInputFrom.ts'
import { createMovementInput, type MutableMovementInput } from './wishDirection.ts'

/**
 * A sala dos testes da sessão: um piso, um bot parado num posto a 20 m, e o
 * jogador mirando a cabeça dele. Mora fora dos arquivos de teste porque são
 * dois — o do tick (`arenaSession.test.ts`) e o do começo e do fim da partida
 * (`arenaRestart.test.ts`) —, como o `botTestKit.ts` do núcleo.
 */
export const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
export const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

export const FLOOR: StaticBox = boxFromCenterSize([0, -0.5, 0], [200, 1, 200])
export const SPAWN_FEET = { x: 0, y: 0, z: 0 }
/** Onde o bot dos testes nasce e fica: 20 m à frente do jogador, no pé. */
export const BOT_POST = { x: 0, y: 0, z: 20 }
/**
 * O grafo do bot dos testes: dois pontos a 40 cm um do outro em cima do posto.
 * Os dois caem no raio de chegada, então o bot "chega" a cada tick e fica onde
 * está — um alvo parado, com a cabeça e a arma de um bot de verdade.
 */
export const POST_GRAPH = createNavGraph(
  [
    { name: 'posto', feetM: { x: -0.2, y: 0, z: 20 } },
    { name: 'posto-2', feetM: { x: 0.2, y: 0, z: 20 } },
  ],
  [{ from: 'posto', to: 'posto-2', kind: 'walk' }],
)
export const FRAME_S = 1 / 60
/** A sala cheia de bots, no nível normal, com a katana na classe. */
export const ROOM_RULES = { botDifficulty: 'normal', botCount: 3, meleeWeapon: 'katana' } as const
/** Folgada em volta do spawn: os testes de tiro nunca chegam perto da borda. */
export const WIDE_AREA: PlayArea = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }
/** Uma área que não contém o spawn: o jogador nasce já fora dela. */
export const AREA_EAST: PlayArea = { minX: 10, maxX: 30, minZ: -10, maxZ: 10 }
export const RESPAWN_INSIDE = { x: 20, y: 0, z: 0 }
/** O jogador começa fora da `AREA_EAST`, e o único spawn fica dentro dela. */
export const OUTSIDE_EAST: BoundaryRig = {
  playArea: AREA_EAST,
  respawnFeetM: [RESPAWN_INSIDE],
  startFeetM: SPAWN_FEET,
}

export interface BoundaryRig {
  readonly playArea?: PlayArea
  readonly respawnFeetM?: readonly Readonly<Vector3>[]
  /** Quantos humanos na sala: 3 dá um bot, 4 (a sala cheia) não dá nenhum. */
  readonly humans?: number
  /** Na partida o bot atira; nos testes de tiro do jogador, ele é só alvo. */
  readonly hostileBots?: boolean
  /**
   * Onde o jogador está quando a partida começa. A partida nova o põe no
   * primeiro spawn; os testes do limite o querem fora da área, onde nenhum
   * spawn fica.
   */
  readonly startFeetM?: Readonly<Vector3>
  /** Outra configuração: a partida curta dos testes do fim de partida. */
  readonly config?: GameplayConfig
}

export interface Rig {
  readonly session: ArenaSession
  readonly weaponInput: MutableWeaponInput
  readonly movementInput: MutableMovementInput
  frame(over?: Partial<ArenaFrame>): number
}

export function mountSession(
  boxes: readonly StaticBox[] = [FLOOR],
  boundary: BoundaryRig = {},
): Rig {
  const weaponInput = createWeaponInput()
  const movementInput = createMovementInput()
  const session = openSession(boxes, boundary, { weaponInput, movementInput })
  session.restartMatch({ ...ROOM_RULES, hostileBots: boundary.hostileBots ?? false })
  if (boundary.startFeetM) session.character.respawnAt(boundary.startFeetM)
  return {
    session,
    weaponInput,
    movementInput,
    frame: (over = {}) =>
      session.advance({
        elapsedS: FRAME_S,
        // o olho do jogador, mirando a cabeça do bot lá na frente.
        eyeM: { x: 0, y: 1.656, z: 0 },
        aimM: { x: 0, y: 0, z: 1 },
        ...over,
      }),
  }
}

/**
 * Mira assentada antes de atirar. Com a mira crua o tiro sofre o cone de
 * `noScopeSpreadDeg`, que a 20 m tem raio de 1,6 m contra um alvo de 0,8 m:
 * errar é o resultado comum, e um teste de acerto não pode depender de sorte.
 */
export function settleScope(rig: Rig): void {
  // soltar antes: o disparo fecha a mira, e o botão preso não a reabre.
  rig.weaponInput.scope = false
  rig.frame()
  rig.weaponInput.scope = true
  for (let frame = 0; frame < 10; frame += 1) rig.frame()
}

/** Um toque no gatilho. Devolve o tiro do quadro em que ele saiu. */
export function pullTrigger(rig: Rig): Readonly<ShotHit> | undefined {
  rig.weaponInput.fire = true
  rig.frame()
  const shot = rig.session.lastShot
  rig.weaponInput.fire = false
  rig.frame()
  return shot
}

/**
 * As medalhas do quadro do tiro, copiadas. `lastMedals` é reaproveitado e o
 * quadro seguinte já o esvaziou — o mesmo contrato do `lastShot`.
 */
export function pullTriggerForMedals(rig: Rig): readonly string[] {
  rig.weaponInput.fire = true
  rig.frame()
  const slugs = rig.session.lastMedals.map((award) => award.medal.slug)
  rig.weaponInput.fire = false
  rig.frame()
  return slugs
}

/** Os pontos de medalha do quadro do tiro, pela mesma razão. */
export function pullTriggerForBonus(rig: Rig): number {
  rig.weaponInput.fire = true
  rig.frame()
  const bonus = rig.session.lastMedals.reduce((sum, award) => sum + award.points, 0)
  rig.weaponInput.fire = false
  rig.frame()
  return bonus
}

function openSession(
  boxes: readonly StaticBox[],
  boundary: BoundaryRig,
  inputs: { weaponInput: MutableWeaponInput; movementInput: MutableMovementInput },
): ArenaSession {
  const rigConfig = boundary.config ?? config
  return createArenaSession({
    config: rigConfig,
    character: createLocalCharacter(rigConfig, SPAWN_FEET, boxes),
    boxes,
    navGraph: POST_GRAPH,
    ...inputs,
    playArea: boundary.playArea ?? WIDE_AREA,
    // o jogador nasce no primeiro, então o bot fica com o posto.
    respawnFeetM: boundary.respawnFeetM ?? [SPAWN_FEET, BOT_POST],
    humans: boundary.humans ?? config.match.playersPerRoom - 1,
  })
}
