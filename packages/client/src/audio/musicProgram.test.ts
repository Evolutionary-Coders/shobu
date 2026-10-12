import { describe, expect, it } from 'vitest'
import { MUSIC_PLAYLIST, MUSIC_PLAYLIST_URLS, nextTrackIndex } from './musicProgram.ts'
import { musicUrl } from './soundCatalog.ts'

describe('MUSIC_PLAYLIST', () => {
  it('abre com a Midnight Pursuit', () => {
    expect(MUSIC_PLAYLIST[0]).toBe('Midnight_Pursuit')
    expect(MUSIC_PLAYLIST_URLS[0]).toBe(musicUrl('Midnight_Pursuit'))
  })

  it('toca cada faixa uma vez por volta', () => {
    expect(new Set(MUSIC_PLAYLIST).size).toBe(MUSIC_PLAYLIST.length)
  })
})

describe('nextTrackIndex', () => {
  it('segue para a próxima faixa', () => {
    expect(nextTrackIndex(0, 6)).toBe(1)
  })

  it('depois da última volta à primeira', () => {
    expect(nextTrackIndex(5, 6)).toBe(0)
  })

  it('lista vazia é erro, com o valor recebido', () => {
    expect(() => nextTrackIndex(0, 0)).toThrow('length recebeu 0')
  })
})
