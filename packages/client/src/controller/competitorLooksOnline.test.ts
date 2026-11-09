import type { HumanSkinId } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { AHEAD, mountOnline, type OnlineRig, snapshotAt } from './arenaOnlineTestKit.ts'
import { LOCAL_PLAYER_ID } from './arenaSession.ts'
import { ROOM_RULES } from './arenaSessionTestKit.ts'

/** O visual que esta tela dá a quem a sala chama de `playerId`. */
function lookOnScreen(rig: OnlineRig, playerId: string) {
  let slotId = ''
  rig.session.forEachRoomPlayer((id, fighter) => {
    if (id === playerId) slotId = fighter.id
  })
  return rig.session.lookOf(slotId)
}

/** Uma tela com a skin dada, que vê os jogadores da sala chegarem na ordem dada. */
function screen(playerSkin: HumanSkinId, arrivals: readonly [string, HumanSkinId][]): OnlineRig {
  const rig = mountOnline(playerSkin)
  for (const [playerId, skin] of arrivals) {
    rig.room.remotes.set(playerId, { ...snapshotAt(AHEAD, true, 'laser', skin), accent: 2 })
    rig.frame()
  }
  return rig
}

describe('o visual online', () => {
  /**
   * Regressão do playtest: cada tela vestia os outros pela vaga local em que
   * caíam e pela própria skin, e duas telas viam o mesmo jogador com dois corpos.
   */
  it('duas telas veem cada jogador com a skin que ele escolheu, qualquer que seja a delas', () => {
    const first = screen('vex', [
      ['ana', 'nova'],
      ['caio', 'brick'],
    ])
    const second = screen('nova', [
      ['caio', 'brick'],
      ['ana', 'nova'],
    ])
    for (const rig of [first, second]) {
      expect(lookOnScreen(rig, 'ana')).toEqual({ skin: 'nova', sniperFinish: '', accent: 2 })
      expect(lookOnScreen(rig, 'caio').skin).toBe('brick')
    }
  })

  it('a vaga que volta a ser bot sai da skin de quem saiu', () => {
    const rig = screen('ronin', [['ana', 'ronin']])
    rig.room.remotes.delete('ana')
    rig.frame()
    rig.room.ownId = undefined
    rig.frame()
    expect(rig.session.lookOf('bot-0').skin).not.toBe('ronin')
  })

  it('o jogador local veste o visual da classe que a partida trouxe', () => {
    const rig = mountOnline('vex')
    rig.session.restartMatch({
      ...ROOM_RULES,
      hostileBots: false,
      look: { characterSkin: 'brick', sniperFinish: 'carbono' },
    })
    expect(rig.session.lookOf(LOCAL_PLAYER_ID)).toEqual({
      skin: 'brick',
      sniperFinish: 'carbono',
      accent: 0,
    })
  })
})
