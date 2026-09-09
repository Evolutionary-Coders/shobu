import { readFileSync } from 'node:fs'
import { boxFromCenterSize, type StaticBox } from '../collision/staticBox.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import { parseGameplayConfig } from '../config/parseGameplayConfig.ts'
import { type CharacterState, createCharacterState } from './characterState.ts'
import { IDLE_INPUT, type MovementInput } from './movementInput.ts'
import { stepCharacter } from './stepCharacter.ts'

/**
 * Apoio dos testes de movimentação: a config versionada, um chão, e um jeito
 * de avançar N ticks com a mesma entrada. Só os testes importam isto; não é
 * api do núcleo.
 *
 * A config é a **versionada**, não uma inventada: se o playtest mudar um
 * número e uma regra deixar de valer, o teste conta — é o ponto da ADR 0005.
 */
const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)

export function shippedConfig(): GameplayConfig {
  return parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
}

/** Piso de 64 m de lado terminando em y 0, como o `floor` do greybox. */
export const FLOOR: StaticBox = boxFromCenterSize([0, -0.5, 0], [64, 1, 64])

export function tickDurationS(config: GameplayConfig): number {
  return 1 / config.simulation.tickHz
}

/** Jogador de pé no chão, já assentado: um tick parado para o `grounded` existir. */
export function standingCharacter(
  config: GameplayConfig,
  boxes: readonly StaticBox[] = [FLOOR],
): CharacterState {
  const state = createCharacterState({ x: 0, y: 0, z: 0 }, config)
  stepCharacter(state, IDLE_INPUT, boxes, config, tickDurationS(config))
  return state
}

export function runTicks(
  state: CharacterState,
  input: MovementInput,
  ticks: number,
  config: GameplayConfig,
  boxes: readonly StaticBox[] = [FLOOR],
): CharacterState {
  const dtS = tickDurationS(config)
  for (let index = 0; index < ticks; index += 1) stepCharacter(state, input, boxes, config, dtS)
  return state
}

/** Quantos ticks cabem em `seconds`, arredondando para cima. */
export function ticksFor(seconds: number, config: GameplayConfig): number {
  return Math.ceil(seconds * config.simulation.tickHz)
}

export const FORWARD: MovementInput = { ...IDLE_INPUT, wishZ: 1 }
export const SPRINT_FORWARD: MovementInput = { ...FORWARD, sprint: true }
