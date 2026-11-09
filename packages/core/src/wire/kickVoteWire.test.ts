import { describe, expect, it } from 'vitest'
import { entryDeviceKeyOf } from '../room/roomEntry.ts'
import { KICK_CLOSE_CODE, kickBallotOf, kickTargetOf, parseDeviceKey } from './kickVoteWire.ts'
import { AFK_CLOSE_CODE, PAGE_RELOAD_CLOSE_CODE } from './wireFormat.ts'

const KEY = '3f1c2b8e-9a7d-4c1e-8b2a-6d5e4f3a2b1c'

describe('kickTargetOf', () => {
  it('aceita um id de jogador', () => {
    expect(kickTargetOf({ targetId: 'aB3xYz' })).toBe('aB3xYz')
  })

  it.each([
    undefined,
    null,
    'aB3',
    {},
    { targetId: 7 },
    { targetId: '' },
    { targetId: 'x'.repeat(65) },
  ])('recusa %j', (raw) => {
    expect(kickTargetOf(raw)).toBeUndefined()
  })
})

describe('kickBallotOf', () => {
  it.each([true, false])('aceita %s', (yes) => {
    expect(kickBallotOf({ yes })).toBe(yes)
  })

  it.each([undefined, null, true, { yes: 'sim' }])('recusa %j', (raw) => {
    expect(kickBallotOf(raw)).toBeUndefined()
  })
})

describe('parseDeviceKey', () => {
  it('aceita um uuid', () => {
    expect(parseDeviceKey(KEY)).toBe(KEY)
  })

  it.each([undefined, 7, '', 'curta', 'ZZZZZZZZZZZZZZZZZZ', 'a'.repeat(65), '<script>'])(
    'recusa %j',
    (raw) => {
      expect(parseDeviceKey(raw)).toBe('')
    },
  )
})

describe('entryDeviceKeyOf', () => {
  it('lê a chave do corpo da entrada', () => {
    expect(entryDeviceKeyOf({ kind: 'quick', arenaId: '', deviceKey: KEY })).toBe(KEY)
  })

  it.each([undefined, null, {}, { deviceKey: 'x' }])('sem chave válida, vazia: %j', (body) => {
    expect(entryDeviceKeyOf(body)).toBe('')
  })
})

describe('KICK_CLOSE_CODE', () => {
  it('fica fora da faixa do colyseus e dos outros códigos da sala', () => {
    expect(KICK_CLOSE_CODE).toBeGreaterThan(4010)
    expect([AFK_CLOSE_CODE, PAGE_RELOAD_CLOSE_CODE]).not.toContain(KICK_CLOSE_CODE)
  })
})
