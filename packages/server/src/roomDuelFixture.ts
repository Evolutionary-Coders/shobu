import { readFileSync } from 'node:fs'
import {
  boxFromCenterSize,
  createNavGraph,
  encodeButtons,
  parseGameplayConfig,
  type WireButtons,
  type WireInput,
} from '@shobu/core'
import { FakeRoomIo } from './roomIoFake.ts'
import { FORWARD_AIM, type RoomSeat } from './roomSeat.ts'
import {
  createRoomSimulation,
  joinRoom,
  type RoomRules,
  type RoomSimulation,
} from './roomSimulation.ts'

/*
 * O duelo dos testes da sala: Ana e Bia frente a frente num campo aberto, e o
 * input de fio que cada teste monta. Fora do teste para os testes da sala
 * dividirem o mesmo duelo sem passar do tamanho de arquivo.
 */

const SHIPPED_CONFIG_URL = new URL('../../../config/gameplay.json', import.meta.url)
export const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
/**
 * Uma sala de dois: com dois humanos, `botSeatsFor` não senta bot nenhum, e o
 * duelo dos testes é só de Ana e Bia. Os bots têm a sala de quatro, nos testes da sala. Sem
 * aquecimento: o primeiro tick já põe a partida valendo, e o tiro mata.
 */
export const config = { ...shipped, match: { ...shipped.match, playersPerRoom: 2, warmupS: 0 } }

/** Dois pontos a 40 cm um do outro na origem: o grafo mínimo para os bots andarem. */
const STILL_GRAPH = createNavGraph(
  [
    { name: 'a', feetM: { x: -0.2, y: 0, z: 0 } },
    { name: 'b', feetM: { x: 0.2, y: 0, z: 0 } },
  ],
  [{ from: 'a', to: 'b', kind: 'walk' }],
)

const NO_BUTTONS: WireButtons = {
  sprint: false,
  jump: false,
  crouch: false,
  grapple: false,
  fire: false,
  scope: false,
  aim: false,
  reload: false,
  melee: false,
  primary: false,
}

export function wire(buttons: Partial<WireButtons> = {}, wish: Partial<WireInput> = {}): WireInput {
  return {
    wishX: 0,
    wishZ: 0,
    buttons: encodeButtons({ ...NO_BUTTONS, ...buttons }),
    ...FORWARD_AIM,
    ...wish,
  }
}

export const FORWARD_WIRE = wire({}, { wishZ: -127 })
export const FIRE_WIRE = wire({ fire: true })
export const DUEL_M = 1.5

/**
 * Um campo aberto, só chão, com dois spawns frente a frente: a mira padrão,
 * para -z, cruza o alvo. O duelo é a 1,5 m, onde o cone sem luneta tem raio
 * menor que o da cápsula, e o tiro acerta sem depender de sorte. A área de jogo cobre o
 * campo inteiro, menos onde um teste leva alguém para fora.
 */
export const open: RoomRules = {
  arenaId: 'campo-aberto',
  config,
  boxes: [boxFromCenterSize([0, -0.5, 0], [400, 1, 400])],
  spawnsFeetM: [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: -3 },
  ],
  playArea: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  navGraph: STILL_GRAPH,
}

export function seat(room: RoomSimulation, playerId: string): RoomSeat {
  const found = room.seats.get(playerId)
  if (!found) throw new Error(`'${playerId}' fora da sala`)
  return found
}

export interface Duel {
  readonly room: RoomSimulation
  readonly io: FakeRoomIo
}

/** Ana no primeiro spawn, Bia no segundo, bem na mira de Ana. */
export function duel(rules: RoomRules = open): Duel {
  const room = createRoomSimulation(rules)
  joinRoom(room, 'ana', 'knife', rules)
  joinRoom(room, 'bia', 'knife', rules)
  const ana = seat(room, 'ana')
  const bia = seat(room, 'bia')
  Object.assign(ana.body.position, { x: 0, y: 0, z: 0 })
  Object.assign(bia.body.position, { x: 0, y: 0, z: -DUEL_M })
  return { room, io: new FakeRoomIo(room) }
}
