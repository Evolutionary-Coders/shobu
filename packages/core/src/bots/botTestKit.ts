import { boxFromCenterSize, type StaticBox } from '../collision/staticBox.ts'
import type { Fighter } from '../match/fighter.ts'
import { createCharacterState } from '../movement/characterState.ts'
import { IDLE_INPUT } from '../movement/movementInput.ts'
import { FLOOR, shippedConfig, tickDurationS } from '../movement/movementTestKit.ts'
import { stepCharacter } from '../movement/stepCharacter.ts'
import type { BotArena } from './botSquad.ts'
import { createNavGraph } from './navGraph.ts'

/**
 * Apoio dos testes de bot: uma arena de bolso com chão, uma parede no meio e
 * um grafo de quatro pontos em volta dela. Só os testes importam isto; não é
 * api do núcleo, como o `movementTestKit.ts`.
 *
 * ```
 *   oeste ──── norte ──── leste        z = 10
 *     │                     │
 *     │      ███████        │          a parede: x de -3 a 3, z de -1 a 1
 *     │                     │
 *   oeste-sul ─ sul ─ leste-sul        z = -10
 * ```
 */
export const config = shippedConfig()
export const DT_S = tickDurationS(config)
export const WALL: StaticBox = boxFromCenterSize([0, 2, 0], [6, 4, 2])
export const BOXES: readonly StaticBox[] = [FLOOR, WALL]

export const GRAPH = createNavGraph(
  [
    { name: 'oeste', feetM: { x: -10, y: 0, z: 10 } },
    { name: 'norte', feetM: { x: 0, y: 0, z: 10 } },
    { name: 'leste', feetM: { x: 10, y: 0, z: 10 } },
    { name: 'leste-sul', feetM: { x: 10, y: 0, z: -10 } },
    { name: 'sul', feetM: { x: 0, y: 0, z: -10 } },
    { name: 'oeste-sul', feetM: { x: -10, y: 0, z: -10 } },
  ],
  [
    { from: 'oeste', to: 'norte', kind: 'walk' },
    { from: 'norte', to: 'leste', kind: 'walk' },
    { from: 'leste', to: 'leste-sul', kind: 'walk' },
    { from: 'leste-sul', to: 'sul', kind: 'walk' },
    { from: 'sul', to: 'oeste-sul', kind: 'walk' },
    { from: 'oeste-sul', to: 'oeste', kind: 'walk' },
  ],
)

export const ARENA: BotArena = {
  boxes: BOXES,
  graph: GRAPH,
  spawnsFeetM: [
    { x: -10, y: 0, z: 10 },
    { x: 10, y: 0, z: -10 },
    { x: 10, y: 0, z: 10 },
    { x: -10, y: 0, z: -10 },
  ],
}

/**
 * Um combatente parado no pé pedido, já apoiado. É o "jogador" dos testes:
 * só o corpo e o estado de vida, que é tudo o que um bot enxerga dele.
 */
export function standingFighter(id: string, feetM: { x: number; y: number; z: number }): Fighter {
  const body = createCharacterState(feetM, config)
  stepCharacter(body, IDLE_INPUT, BOXES, config, DT_S)
  return { id, body, alive: true, respawnLeftS: 0 }
}

/** A semente que faz `sampleAimJitter` desistir: oito tiradas seguidas fora da bola. */
export const JITTER_GIVE_UP_SEED = 440
