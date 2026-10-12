import { readFileSync } from 'node:fs'
import {
  boxFromCenterSize,
  createNavGraph,
  killsWithin,
  type MeleeWeapon,
  parseGameplayConfig,
  type StaticBox,
} from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { type ArenaSession, createArenaSession, type MatchRules } from './arenaSession.ts'
import { createLocalCharacter } from './localCharacter.ts'
import { createWeaponInput, type MutableWeaponInput } from './weaponInputFrom.ts'
import { createMovementInput, type MutableMovementInput } from './wishDirection.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
const FLOOR: StaticBox = boxFromCenterSize([0, -0.5, 0], [200, 1, 200])
const FRAME_S = 1 / 60
const SPAWN_FEET = { x: 0, y: 0, z: 0 }
/** O bot colado no jogador: 1,6 m à frente, dentro do alcance da faca. */
const BOT_POST = { x: 0, y: 0, z: 1.6 }
const POST_GRAPH = createNavGraph(
  [
    { name: 'posto', feetM: { x: -0.1, y: 0, z: 1.6 } },
    { name: 'posto-2', feetM: { x: 0.1, y: 0, z: 1.6 } },
  ],
  [{ from: 'posto', to: 'posto-2', kind: 'walk' }],
)

interface Rig {
  readonly session: ArenaSession
  readonly weaponInput: MutableWeaponInput
  readonly movementInput: MutableMovementInput
  frames(count?: number): void
}

function mountMelee(rules: Partial<MatchRules> = {}, meleeWeapon: MeleeWeapon = 'katana'): Rig {
  const weaponInput = createWeaponInput()
  const movementInput = createMovementInput()
  const session = createArenaSession({
    config,
    character: createLocalCharacter(config, SPAWN_FEET, [FLOOR]),
    boxes: [FLOOR],
    navGraph: POST_GRAPH,
    movementInput,
    weaponInput,
    playArea: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    respawnFeetM: [SPAWN_FEET, BOT_POST],
    humans: config.match.playersPerRoom - 1,
  })
  session.restartMatch({
    hostileBots: false,
    botDifficulty: 'normal',
    botCount: 1,
    meleeWeapon,
    ...rules,
  })
  const frames = (count = 1): void => {
    for (let frame = 0; frame < count; frame += 1) {
      session.advance({
        elapsedS: FRAME_S,
        eyeM: { x: 0, y: 1.656, z: 0 },
        aimM: { x: 0, y: 0, z: 1 },
      })
    }
  }
  return { session, weaponInput, movementInput, frames }
}

describe('corpo a corpo na sessão', () => {
  it('o golpe rápido de katana mata o bot colado, com a kill de katana no registro', () => {
    const rig = mountMelee()
    rig.weaponInput.melee = true
    rig.frames(3)
    rig.weaponInput.melee = false
    rig.frames()
    expect(rig.session.bots[0]?.alive).toBe(false)
    expect(rig.session.lastKills.slots[0]?.weapon).toBe('katana')
    expect(rig.session.melee.strikes).toBe(1)
  })

  it('com a faca na classe, o toque golpeia na soltura e a kill é de faca', () => {
    const rig = mountMelee({}, 'knife')
    rig.weaponInput.melee = true
    rig.frames()
    expect(rig.session.melee.strikes).toBe(0)
    rig.weaponInput.melee = false
    rig.frames()
    expect(rig.session.lastKills.slots[0]?.weapon).toBe('knife')
  })

  it('com a faca na classe, segurar a empunha, e o tiro vira facada', () => {
    const rig = mountMelee({}, 'knife')
    rig.weaponInput.melee = true
    rig.frames(Math.ceil(config.melee.holdToDrawS / FRAME_S) + 2)
    rig.weaponInput.melee = false
    rig.frames(Math.ceil(config.melee.knifeDrawS / FRAME_S) + 2)
    expect([rig.session.melee.bladeDrawn, rig.session.weapon.holstered]).toEqual([true, true])
    rig.weaponInput.fire = true
    rig.frames()
    expect(rig.session.lastKills.slots[0]?.weapon).toBe('knife')
  })

  it('segurar empunha a katana, e o tiro vira corte', () => {
    const rig = mountMelee({ botCount: 0 })
    rig.weaponInput.melee = true
    rig.frames(Math.ceil(config.melee.holdToDrawS / FRAME_S) + 2)
    rig.weaponInput.melee = false
    rig.frames(Math.ceil(config.melee.katanaDrawS / FRAME_S) + 2)
    expect(rig.session.melee.bladeDrawn).toBe(true)
    expect(rig.session.weapon.holstered).toBe(true)
    rig.weaponInput.fire = true
    rig.frames()
    expect([rig.session.melee.strikeKind, rig.session.weapon.shotsFired]).toEqual(['slash', 0])
  })

  it('o bot de faca mata o jogador colado, na partida', () => {
    const rig = mountMelee({ hostileBots: true })
    rig.frames(Math.ceil(3 / FRAME_S))
    expect(rig.session.scoreboard.players.get('local')?.deaths).toBeGreaterThan(0)
    expect(rig.session.scoreboard.players.get('bot-0')?.kills).toBeGreaterThan(0)
  })

  it('renascer volta à sniper', () => {
    const rig = mountMelee({ hostileBots: true })
    rig.session.restartMatch({
      hostileBots: true,
      botDifficulty: 'normal',
      botCount: 1,
      meleeWeapon: 'katana',
    })
    rig.weaponInput.melee = true
    rig.frames(Math.ceil(3 / FRAME_S))
    rig.weaponInput.melee = false
    rig.frames(Math.ceil((config.match.respawnDelayS + 0.5) / FRAME_S))
    expect(rig.session.melee.bladeDrawn).toBe(false)
  })

  it('morto fora da área também volta à sniper', () => {
    const rig = mountMelee({ botCount: 0 })
    rig.weaponInput.melee = true
    rig.frames(Math.ceil(config.melee.holdToDrawS / FRAME_S) + 2)
    rig.session.character.respawnAt({ x: 80, y: 0, z: 0 })
    rig.frames(Math.ceil((config.match.outOfBoundsGraceS + 0.5) / FRAME_S))
    expect(rig.session.melee.bladeDrawn).toBe(false)
  })
})

describe('restartMatch', () => {
  /**
   * O falso `kill-chain` de 11/10: o placar atravessa a partida e o relógio
   * não, então as kills da partida velha caíam na janela da primeira da nova.
   */
  it('esquece os instantes das kills da partida anterior', () => {
    const rig = mountMelee({ botCount: 0 })
    const local = rig.session.scoreboard.players.get('local')
    local?.recentKillsAtS.fill(300)
    rig.session.restartMatch({
      hostileBots: false,
      botDifficulty: 'normal',
      botCount: 0,
      meleeWeapon: 'katana',
    })
    expect(local && killsWithin(local, 1, config.medals.killChainWindowS)).toBe(0)
  })

  it('o relógio volta a andar depois de zerado', () => {
    const rig = mountMelee({ botCount: 0 })
    rig.frames()
    rig.session.restartMatch({
      hostileBots: false,
      botDifficulty: 'normal',
      botCount: 0,
      meleeWeapon: 'katana',
    })
    rig.frames()
    expect(rig.session.matchTimeS).toBeGreaterThan(0)
  })

  /** O nome é da entrada, como a classe: o placar e o killfeed o leem por `nameOf`. */
  it('o nome de perfil vale da entrada em diante, e entrada sem nome mantém o anterior', () => {
    const rig = mountMelee({ botCount: 0, callsign: 'RAIDEN' })
    expect(rig.session.nameOf('local')).toBe('RAIDEN')
    rig.session.restartMatch({
      hostileBots: false,
      botDifficulty: 'normal',
      botCount: 0,
      meleeWeapon: 'katana',
    })
    expect(rig.session.nameOf('local')).toBe('RAIDEN')
  })
})

describe('bots no banco', () => {
  it('a contagem de bots tira os de fora do placar e do jogo', () => {
    const rig = mountMelee({ botCount: 0 })
    expect(rig.session.bots[0]?.alive).toBe(false)
    expect(rig.session.scoreboard.players.has('bot-0')).toBe(false)
    rig.session.restartMatch({
      hostileBots: false,
      botDifficulty: 'normal',
      botCount: 1,
      meleeWeapon: 'katana',
    })
    expect(rig.session.scoreboard.players.has('bot-0')).toBe(true)
  })
})

describe('sprint-to-fire na sessão', () => {
  it('atirar correndo sai da corrida, e o tiro sai depois de a arma subir', () => {
    const rig = mountMelee({ botCount: 0 })
    rig.movementInput.wishZ = 1
    rig.movementInput.sprint = true
    rig.frames(20)
    expect(rig.session.character.current.sprinting).toBe(true)
    rig.weaponInput.fire = true
    rig.frames()
    expect(rig.session.weapon.shotsFired).toBe(0)
    expect(rig.session.character.current.sprinting).toBe(false)
    expect(rig.movementInput.sprint).toBe(true)
    rig.weaponInput.fire = false
    rig.frames(Math.ceil(config.weapon.sprintToFireS / FRAME_S) + 2)
    expect(rig.session.weapon.shotsFired).toBe(1)
  })
})

/**
 * Regressão do playtest de 11/10: segurar o shift e atirar ligava a corrida
 * plena. O tiro tirava o shift da entrada enquanto a sniper subia, e quando
 * ele voltava, ainda preso, o núcleo via um segundo aperto. Teclado, L3 e o
 * analógico do toque escrevem o mesmo `sprint`, então os três passam por aqui.
 */
describe('o shift preso enquanto a arma age', () => {
  function sprinting(): Rig {
    const rig = mountMelee()
    Object.assign(rig.movementInput, { wishZ: 1, sprint: true })
    rig.frames(60)
    return rig
  }

  /** Segue com o shift preso e diz se a corrida plena ligou em algum quadro. */
  function everTactical(rig: Rig, frames: number): boolean {
    let tactical = false
    for (let frame = 0; frame < frames; frame += 1) {
      rig.frames()
      tactical ||= rig.session.character.current.tacticalSprinting
    }
    return tactical
  }

  it('um tiro: volta à corrida, nunca à plena', () => {
    const rig = sprinting()
    rig.weaponInput.fire = true
    rig.frames()
    rig.weaponInput.fire = false
    expect(everTactical(rig, 60)).toBe(false)
    expect(rig.session.weapon.shotsFired).toBe(1)
    expect(rig.session.character.current.sprinting).toBe(true)
  })

  it('a luneta aberta e fechada: volta à corrida, nunca à plena', () => {
    const rig = sprinting()
    // o botão direito alterna: aperta e solta para abrir, de novo para fechar.
    for (const scope of [true, false, true, false]) {
      rig.weaponInput.scope = scope
      rig.frames(20)
    }
    expect(rig.session.weapon.scoped).toBe(false)
    expect(everTactical(rig, 30)).toBe(false)
    expect(rig.session.character.current.sprinting).toBe(true)
  })
})
