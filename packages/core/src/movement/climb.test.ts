import { describe, expect, it } from 'vitest'
import { boxFromCenterSize, type StaticBox } from '../collision/staticBox.ts'
import { horizontalSpeed } from './characterState.ts'
import { maxDoubleJumpHeightM } from './jump.ts'
import { IDLE_INPUT, type MovementInput } from './movementInput.ts'
import { runTicks, shippedConfig, standingCharacter, tickDurationS } from './movementTestKit.ts'

const config = shippedConfig()
const dtS = tickDurationS(config)

/** Chão largo, e uma cobertura na altura das do greybox, começando em x = 3. */
const COVER_TOP_M = 2.2
const FLOOR: StaticBox = boxFromCenterSize([0, -0.5, 0], [64, 1, 64])
const COVER: StaticBox = boxFromCenterSize([7, COVER_TOP_M / 2, 0], [8, COVER_TOP_M, 8])
const ARENA: readonly StaticBox[] = [FLOOR, COVER]

const RUN_AT_COVER: MovementInput = { ...IDLE_INPUT, wishX: 1, sprint: true }

/**
 * Corre na cobertura, dá o segundo pulo no ápice do primeiro — o melhor caso,
 * que é o que o envelope de `maxDoubleJumpHeightM` promete — e **solta o
 * direcional ao passar da borda**, como qualquer jogador faz.
 *
 * Soltar importa: a aceleração no ar é de 40 m/s² e não tem freio enquanto a
 * tecla estiver presa, então continuar empurrando atravessa os 8 m da caixa no
 * ar e aterrissa do outro lado. O teste sem a soltura media isso e concluía,
 * errado, que a caixa não era escalável.
 */
function doubleJumpAtCover(): ReturnType<typeof standingCharacter> {
  const state = standingCharacter(config, ARENA)
  runTicks(state, RUN_AT_COVER, 20, config, ARENA)
  // primeiro pulo: um tick com a tecla, um sem, para a borda existir.
  runTicks(state, { ...RUN_AT_COVER, jump: true }, 1, config, ARENA)
  runTicks(state, RUN_AT_COVER, 1, config, ARENA)
  // o ápice do primeiro pulo é v/g depois da saída.
  const apexTicks = Math.round(
    config.movement.jumpImpulseMps / Math.abs(config.movement.gravityMps2) / dtS,
  )
  runTicks(state, RUN_AT_COVER, apexTicks - 2, config, ARENA)
  runTicks(state, { ...RUN_AT_COVER, jump: true }, 1, config, ARENA)
  // empurra só até limpar a borda, e solta.
  for (let tick = 0; tick < 60 && state.position.y < COVER_TOP_M + 0.1; tick += 1) {
    runTicks(state, RUN_AT_COVER, 1, config, ARENA)
  }
  runTicks(state, IDLE_INPUT, 60, config, ARENA)
  return state
}

/**
 * A ponte entre o level design e a movimentação, **pela simulação** e não pela
 * aritmética: o teste do blockout prova que a caixa cabe no envelope, e este
 * prova que o jogador de fato termina em pé em cima dela.
 *
 * As coberturas nasceram com 3 m contra um alcance de 2,68 m, e ninguém
 * percebeu porque nenhum teste subia em nada.
 */
describe('subir numa cobertura do chão', () => {
  it('o pulo duplo põe o jogador em cima da caixa', () => {
    const state = doubleJumpAtCover()
    expect(state.position.y).toBeCloseTo(COVER_TOP_M, 2)
    expect(state.grounded).toBe(true)
  })

  it('e ele fica lá, em vez de escorregar de volta', () => {
    const state = doubleJumpAtCover()
    runTicks(state, IDLE_INPUT, 60, config, ARENA)
    expect(state.position.y).toBeCloseTo(COVER_TOP_M, 2)
    expect(horizontalSpeed(state)).toBeLessThan(0.1)
  })

  /** Um pulo só não pode bastar, senão a cobertura deixa de ser obstáculo. */
  it('um pulo só não chega ao topo', () => {
    const state = standingCharacter(config, ARENA)
    runTicks(state, RUN_AT_COVER, 20, config, ARENA)
    runTicks(state, { ...RUN_AT_COVER, jump: true }, 1, config, ARENA)
    let highest = state.position.y
    for (let tick = 0; tick < 120; tick += 1) {
      runTicks(state, RUN_AT_COVER, 1, config, ARENA)
      highest = Math.max(highest, state.position.y)
    }
    expect(highest).toBeLessThan(COVER_TOP_M)
  })

  /** O jogador tem que pousar **em cima**, não do outro lado da caixa de 8 m. */
  it('ele para em cima da caixa, e não do outro lado dela', () => {
    const state = doubleJumpAtCover()
    expect(state.position.x).toBeGreaterThan(3)
    expect(state.position.x).toBeLessThan(11)
  })

  it('a caixa do teste está dentro do envelope que o núcleo promete', () => {
    expect(COVER_TOP_M).toBeLessThanOrEqual(maxDoubleJumpHeightM(config))
  })
})
