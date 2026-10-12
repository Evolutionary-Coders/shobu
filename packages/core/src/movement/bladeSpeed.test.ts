import { describe, expect, it } from 'vitest'
import type { MeleeWeapon } from '../melee/meleeState.ts'
import { type CharacterState, horizontalSpeed } from './characterState.ts'
import { IDLE_INPUT, type MovementInput } from './movementInput.ts'
import {
  FLOOR,
  FORWARD,
  runTicks,
  SPRINT_FORWARD,
  shippedConfig,
  standingCharacter,
  tickDurationS,
  ticksFor,
} from './movementTestKit.ts'
import { bladeSpeedScale } from './steer.ts'
import { stepCharacter } from './stepCharacter.ts'

/**
 * A velocidade de topo de cada marcha com a sniper, a katana e a faca na mão
 * (pedido de 12/10): "empunhar o corpo a corpo deve dar mais velocidade do que
 * segurar a sniper" — em toda marcha, do agachado à corrida plena, e não só na
 * corrida, que era onde o bônus fixo antigo valia.
 */
const config = shippedConfig()
const { movement, melee } = config
const dtS = tickDurationS(config)

type Hand = MeleeWeapon | null
type Gait = 'crouch' | 'run' | 'sprint' | 'tactical'

const HANDS: readonly Hand[] = [null, 'katana', 'knife']

/** Leva o jogador à marcha e o deixa nela tempo de sobra para chegar ao topo. */
function topSpeed(gait: Gait, drawnBlade: Hand): number {
  const state = standingCharacter(config)
  const hand = { drawnBlade }
  if (gait === 'crouch') return settle(state, { ...FORWARD, ...hand, crouch: true })
  if (gait === 'run') return settle(state, { ...FORWARD, ...hand })
  if (gait === 'sprint') return settle(state, { ...SPRINT_FORWARD, ...hand })
  // o shift duplo: aperta, solta, aperta de novo e segura (`tacticalSprint.ts`).
  stepCharacter(state, { ...SPRINT_FORWARD, ...hand }, [FLOOR], config, dtS)
  stepCharacter(state, { ...FORWARD, ...hand }, [FLOOR], config, dtS)
  const speed = settle(state, { ...SPRINT_FORWARD, ...hand }, 1)
  expect(state.tacticalSprinting).toBe(true)
  return speed
}

function settle(state: CharacterState, input: MovementInput, seconds = 1.5): number {
  return horizontalSpeed(runTicks(state, input, ticksFor(seconds, config), config))
}

const SNIPER_TOP: Readonly<Record<Gait, number>> = {
  crouch: movement.crouchSpeedMps,
  run: movement.runSpeedMps,
  sprint: movement.sprintSpeedMps,
  tactical: movement.tacticalSprintSpeedMps,
}

describe('velocidade com a lâmina na mão', () => {
  for (const gait of Object.keys(SNIPER_TOP) as Gait[]) {
    it(`${gait}: sniper < katana < faca, cada uma na própria proporção`, () => {
      const [sniper, katana, knife] = HANDS.map((hand) => topSpeed(gait, hand))
      expect(sniper).toBeCloseTo(SNIPER_TOP[gait])
      expect(katana).toBeCloseTo(SNIPER_TOP[gait] * melee.katanaSpeedScale)
      expect(knife).toBeCloseTo(SNIPER_TOP[gait] * melee.knifeSpeedScale)
      expect(katana).toBeGreaterThan(sniper as number)
      expect(knife).toBeGreaterThan(katana as number)
    })
  }

  /** "Notável" posto em número: pelo menos um décimo a mais, em toda marcha. */
  it('a diferença para a sniper é de pelo menos 10 % nas duas lâminas', () => {
    expect(melee.katanaSpeedScale).toBeGreaterThanOrEqual(1.1)
    expect(melee.knifeSpeedScale).toBeGreaterThanOrEqual(melee.katanaSpeedScale)
  })

  it('a proporção é 1 com a sniper na mão', () => {
    expect(bladeSpeedScale(IDLE_INPUT, config)).toBe(1)
  })

  /** Sem a proporção no impulso, deslizar com a faca na corrida plena freava o jogador. */
  it('o slide com a lâmina sai na mesma proporção', () => {
    for (const drawnBlade of HANDS) {
      const state = runTicks(
        standingCharacter(config),
        { ...SPRINT_FORWARD, drawnBlade },
        ticksFor(1, config),
        config,
      )
      stepCharacter(state, { ...SPRINT_FORWARD, drawnBlade, crouch: true }, [FLOOR], config, dtS)
      const scale = bladeSpeedScale({ ...IDLE_INPUT, drawnBlade }, config)
      expect(state.stance, String(drawnBlade)).toBe('sliding')
      expect(horizontalSpeed(state)).toBeCloseTo(movement.slideImpulseMps * scale)
    }
  })
})
