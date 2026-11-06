import { describe, expect, it } from 'vitest'
import type { KickMenuRoom } from './kickMenu.ts'
import {
  createMenuState,
  KICK_ROW_INDEX,
  type MenuCommand,
  type MenuState,
  ROOT_ITEMS,
  selectRow,
  stepMenu,
  withMenuKickRoom,
} from './mainMenuModel.ts'

const RAIDEN = { id: 'r1', name: 'RAIDEN' }
const KAGE = { id: 'k1', name: 'KAGE' }
const OPEN_ROOM: KickMenuRoom = {
  targets: [RAIDEN, KAGE],
  ballotFor: undefined,
  blocked: undefined,
}
const EMPTY_ROOM: KickMenuRoom = { targets: [], ballotFor: undefined, blocked: undefined }

function run(commands: readonly MenuCommand[], from: MenuState): MenuState {
  return commands.reduce((state, command) => stepMenu(state, command).state, from)
}

const toBottom: MenuCommand[] = Array(ROOT_ITEMS.length + 2).fill('down')

describe('a linha EXPULSAR JOGADOR na raiz', () => {
  it('é a última, depois do VR, para os índices de cima não mudarem', () => {
    expect(KICK_ROW_INDEX).toBe(ROOT_ITEMS.length)
  })

  it('sem outro humano, a raiz para no VR', () => {
    expect(run(toBottom, createMenuState()).rootIndex).toBe(ROOT_ITEMS.length - 1)
    expect(selectRow(createMenuState(), KICK_ROW_INDEX).rootIndex).toBe(0)
  })

  it('com outro humano, desce até ela, e o clique a alcança', () => {
    const state = withMenuKickRoom(createMenuState(), OPEN_ROOM)
    expect(run(toBottom, state).rootIndex).toBe(KICK_ROW_INDEX)
    expect(selectRow(state, KICK_ROW_INDEX).rootIndex).toBe(KICK_ROW_INDEX)
  })

  it('a seta escolhe o jogador, e confirmar pede a expulsão', () => {
    const atRow = run(toBottom, withMenuKickRoom(createMenuState(), OPEN_ROOM))
    const chosen = run(['right'], atRow)
    expect(chosen.kick.targetIndex).toBe(1)
    expect(stepMenu(chosen, 'activate')).toEqual({ state: chosen, action: 'kick' })
  })

  it('confirmar não pede nada quando já se sabe que não dá', () => {
    const blocked = { ...OPEN_ROOM, blocked: 'SÓ O ANFITRIÃO' }
    const atRow = run(toBottom, withMenuKickRoom(createMenuState(), blocked))
    expect(stepMenu(atRow, 'activate').action).toBe('none')
    expect(stepMenu(atRow, 'back').action).toBe('none')
  })

  it('o cursor sobe para o VR quando a linha some', () => {
    const atRow = run(toBottom, withMenuKickRoom(createMenuState(), OPEN_ROOM))
    expect(withMenuKickRoom(atRow, EMPTY_ROOM).rootIndex).toBe(ROOT_ITEMS.length - 1)
  })

  it('a sala igual devolve o mesmo estado', () => {
    const state = withMenuKickRoom(createMenuState(), OPEN_ROOM)
    expect(withMenuKickRoom(state, OPEN_ROOM)).toBe(state)
  })

  it('o resto da raiz continua igual com ela na tela', () => {
    const state = withMenuKickRoom(createMenuState(), OPEN_ROOM)
    expect(stepMenu(state, 'activate').action).toBe('deploy')
  })
})
