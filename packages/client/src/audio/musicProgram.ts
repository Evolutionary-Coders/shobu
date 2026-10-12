import { type MusicTrack, musicUrl } from './soundCatalog.ts'

/**
 * A trilha do jogo, **por ordem** e não por momento: começa na abertura da
 * página e segue a mesma lista do menu à arena e de volta, sem trocar de faixa
 * quando a tela muda. Faixa que termina passa para a próxima, e a última volta
 * à primeira.
 *
 * Antes era uma faixa por situação (menu, arena, último minuto), e cada troca
 * de tela cortava a música no meio. O último minuto continua anunciado — pelo
 * narrador, não pela trilha.
 *
 * A Midnight Pursuit abre: a que menos disputa com o jogo, com a dinâmica mais
 * plana das seis e o mínimo de energia entre 2 e 6 kHz, que é a faixa do
 * passo, do tiro e do narrador.
 *
 * ```ts
 * MUSIC_PLAYLIST[0] // 'Midnight_Pursuit'
 * ```
 */
export const MUSIC_PLAYLIST: readonly MusicTrack[] = [
  'Midnight_Pursuit',
  'Point_Blank_Pursuit',
  'Iron_Teeth',
  'Blackout_Velocity',
  'Protocol_Seven',
  'Chrome_Perimeter',
]

/** As urls da trilha, montadas uma vez: o pedido por quadro compara por identidade. */
export const MUSIC_PLAYLIST_URLS: readonly string[] = MUSIC_PLAYLIST.map(musicUrl)

/**
 * A posição da faixa depois desta, voltando ao começo no fim da lista.
 *
 * ```ts
 * nextTrackIndex(5, 6) // 0
 * ```
 */
export function nextTrackIndex(index: number, length: number): number {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(`length recebeu ${length}; esperado inteiro >= 1`)
  }
  return (index + 1) % length
}
