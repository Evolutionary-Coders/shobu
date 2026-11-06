import { describe, expect, it } from 'vitest'
import { botSkinsFor } from '../character/humanSkins.ts'
import {
  createCompetitorLooks,
  dressOwnLook,
  lookOf,
  shedRoomLook,
  wearRoomLook,
} from './competitorLooks.ts'

const BOTS = ['bot-0', 'bot-1', 'bot-2']

describe('competitorLooks offline', () => {
  /** Offline nada muda: a conta é a de antes da sala decidir. */
  it('veste os bots como botSkinsFor, com o acento a partir do 1', () => {
    const looks = createCompetitorLooks(BOTS, 'vex')
    const skins = botSkinsFor(BOTS.length, 'vex')
    BOTS.forEach((id, index) => {
      expect(lookOf(looks, id, 'local')).toEqual({
        skin: skins[index],
        sniperFinish: '',
        accent: index + 1,
      })
    })
  })

  it('o jogador local tem a skin dele no acento 0', () => {
    const looks = createCompetitorLooks(BOTS, 'nova')
    expect(lookOf(looks, 'local', 'local')).toEqual({ skin: 'nova', sniperFinish: '', accent: 0 })
  })

  it('sem skin, o jogador local veste a padrão', () => {
    expect(lookOf(createCompetitorLooks(BOTS), 'local', 'local').skin).toBe('ronin')
  })

  it('quem a sessão não conhece veste o corpo padrão', () => {
    const looks = createCompetitorLooks(BOTS, 'vex')
    expect(lookOf(looks, 'fantasma', 'local')).toEqual({
      skin: 'ronin',
      sniperFinish: '',
      accent: 0,
    })
  })
})

describe('dressOwnLook', () => {
  it('troca a skin e o acabamento do jogador, e os bots saem da skin nova', () => {
    const looks = createCompetitorLooks(BOTS, 'ronin')
    dressOwnLook(looks, { characterSkin: 'brick', sniperFinish: 'carbono' })
    expect(lookOf(looks, 'local', 'local')).toMatchObject({
      skin: 'brick',
      sniperFinish: 'carbono',
    })
    expect(BOTS.map((id) => lookOf(looks, id, 'local').skin)).toEqual(botSkinsFor(3, 'brick'))
  })

  it('com a mesma skin, só o acabamento muda', () => {
    const looks = createCompetitorLooks(BOTS, 'ronin')
    const before = lookOf(looks, 'bot-0', 'local')
    dressOwnLook(looks, { characterSkin: 'ronin', sniperFinish: 'grafite-neon' })
    expect(lookOf(looks, 'bot-0', 'local')).toBe(before)
    expect(lookOf(looks, 'local', 'local').sniperFinish).toBe('grafite-neon')
  })
})

describe('wearRoomLook', () => {
  it('a vaga descrita pela sala veste o que a sala diz', () => {
    const looks = createCompetitorLooks(BOTS, 'ronin')
    wearRoomLook(looks, 'bot-1', { skin: 'ronin', sniperFinish: 'carbono', accent: 2 })
    expect(lookOf(looks, 'bot-1', 'local')).toEqual({
      skin: 'ronin',
      sniperFinish: 'carbono',
      accent: 2,
    })
  })

  /** Roda por quadro: reescreve o mesmo objeto em vez de alocar outro. */
  it('reescreve o objeto da vaga no lugar', () => {
    const looks = createCompetitorLooks(BOTS, 'ronin')
    wearRoomLook(looks, 'bot-0', { skin: 'vex', sniperFinish: '', accent: 0 })
    const first = lookOf(looks, 'bot-0', 'local')
    wearRoomLook(looks, 'bot-0', { skin: 'nova', sniperFinish: 'preta', accent: 1 })
    expect(lookOf(looks, 'bot-0', 'local')).toBe(first)
    expect(first).toEqual({ skin: 'nova', sniperFinish: 'preta', accent: 1 })
  })

  it('a vaga que a sala soltou volta à conta offline', () => {
    const looks = createCompetitorLooks(BOTS, 'ronin')
    const offline = lookOf(looks, 'bot-0', 'local')
    wearRoomLook(looks, 'bot-0', { skin: 'nova', sniperFinish: '', accent: 2 })
    shedRoomLook(looks, 'bot-0')
    expect(lookOf(looks, 'bot-0', 'local')).toBe(offline)
  })
})
