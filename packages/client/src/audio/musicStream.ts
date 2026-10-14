import { nextTrackIndex, skipsFailedTrack } from './musicProgram.ts'

/**
 * A música, por **streaming** e não por buffer decodificado.
 *
 * São 3,5 MB somados, e `decodeAudioData` exige o arquivo inteiro na memória
 * antes da primeira nota. Um `<audio>` toca enquanto baixa, então a faixa
 * começa junto com o menu e o download nunca vira espera — que é a conta do
 * pilar 2 (`docs/nfr.md`).
 *
 * Toca uma **lista em ordem** (`musicProgram.ts`): a faixa que termina — ou
 * que falha — passa para a próxima, e a última volta à primeira. Dois elementos em revezamento:
 * o que entra sobe enquanto o que sai desce, sem corte seco entre faixas.
 *
 * ```ts
 * const music = createMusicStream(document, context, destination, window)
 * music.play(MUSIC_PLAYLIST_URLS)
 * ```
 */
export interface MusicStream {
  /** `undefined` cala. Chamar com a lista que já toca não reinicia nada. */
  play(playlist: readonly string[] | undefined): void
  dispose(): void
}

/** Casado com a duração do jack-in: é o tempo que a tela leva para trocar. */
export const MUSIC_CROSSFADE_S = 0.9

interface MusicDeck {
  readonly element: HTMLAudioElement
  readonly gain: GainNode
  /**
   * Sobe a cada vez que este deck entra no ar. O `setTimeout` do
   * desaparecimento guarda o valor de quando foi agendado e só para o deck se
   * ele ainda for o mesmo: sem isso, menu → arena → menu dentro dos 0,9 s do
   * cruzamento faria o relógio da primeira troca calar a faixa da terceira.
   */
  generation: number
}

/** Só o que este módulo usa de `window`; injetar o objeto inteiro seria demais. */
export interface WindowWithTimers {
  setTimeout(handler: () => void, timeoutMs: number): number
}

export function createMusicStream(
  document: Document,
  context: AudioContext,
  destination: AudioNode,
  window: WindowWithTimers,
): MusicStream {
  const decks = createCrossfader(document, context, destination, window)
  const state: PlaylistState = { playlist: undefined, index: 0, failuresInARow: 0 }
  // só o deck no ar avança a lista: o que está saindo também pode terminar
  // (ou falhar) durante o cruzamento, e isso não é fim de faixa nenhuma.
  decks.on('ended', (deck) => {
    if (deck === decks.front()) advance(decks, state)
  })
  decks.on('error', (deck) => {
    if (deck !== decks.front() || !state.playlist) return
    state.failuresInARow += 1
    if (skipsFailedTrack(state.failuresInARow, state.playlist.length)) advance(decks, state)
  })
  decks.on('playing', () => {
    state.failuresInARow = 0
  })
  return {
    play: (playlist) => {
      if (playlist === state.playlist) return
      Object.assign(state, { playlist, index: 0, failuresInARow: 0 })
      decks.cue(playlist?.[0])
    },
    dispose: decks.stop,
  }
}

interface PlaylistState {
  playlist: readonly string[] | undefined
  index: number
  /** Faixas seguidas que falharam sem tocar: uma volta inteira cala a música. */
  failuresInARow: number
}

function advance(decks: Crossfader, state: PlaylistState): void {
  if (!state.playlist) return
  state.index = nextTrackIndex(state.index, state.playlist.length)
  decks.cue(state.playlist[state.index])
}

/** O par de decks e o cruzamento entre eles; quem decide a próxima faixa é a lista. */
interface Crossfader {
  front(): MusicDeck
  cue(url: string | undefined): void
  on(type: 'ended' | 'error' | 'playing', listener: (deck: MusicDeck) => void): void
  stop(): void
}

function createCrossfader(
  document: Document,
  context: AudioContext,
  destination: AudioNode,
  window: WindowWithTimers,
): Crossfader {
  // um par nomeado, e não um vetor indexado: o índice obrigaria uma guarda de
  // `undefined` em cada troca, para uma posição que sempre existe.
  const pair = {
    front: createDeck(document, context, destination),
    back: createDeck(document, context, destination),
  }
  return {
    front: () => pair.front,
    cue: (url) => {
      fadeOut(pair.front, context, window)
      ;[pair.front, pair.back] = [pair.back, pair.front]
      if (url) fadeIn(pair.front, context, url)
    },
    on: (type, listener) => {
      for (const deck of [pair.front, pair.back]) {
        deck.element.addEventListener(type, () => listener(deck))
      }
    },
    stop: () => {
      stopDeck(pair.front)
      stopDeck(pair.back)
    },
  }
}

function createDeck(document: Document, context: AudioContext, destination: AudioNode): MusicDeck {
  const element = document.createElement('audio')
  // sem laço: o fim da faixa é o `ended` que passa para a próxima da lista.
  element.loop = false
  element.preload = 'none'
  // o arquivo é da mesma origem, mas sem isto o `MediaElementSource` recusa
  // ligar o elemento ao grafo em alguns navegadores.
  element.crossOrigin = 'anonymous'
  const gain = context.createGain()
  gain.gain.value = 0
  context.createMediaElementSource(element).connect(gain)
  gain.connect(destination)
  return { element, gain, generation: 0 }
}

function fadeIn(deck: MusicDeck, context: AudioContext, url: string): void {
  deck.generation += 1
  deck.element.src = url
  // `catch` e não `await`: autoplay recusado não pode derrubar o quadro, e o
  // próximo gesto do jogador tenta de novo.
  void deck.element.play().catch(() => {})
  ramp(deck.gain, context, 1)
}

/**
 * Um `setTimeout` por troca de faixa, e não por quadro: pausar junto com a
 * rampa traria o corte seco de volta, e um elemento em ganho zero continua
 * baixando e decodificando. A proibição de relógio do `arenaHud.ts` é sobre o
 * hud disputar o quadro do render; isto acontece umas três vezes por partida.
 */
function fadeOut(deck: MusicDeck, context: AudioContext, window: WindowWithTimers): void {
  if (!deck.element.src) return
  ramp(deck.gain, context, 0)
  const generation = deck.generation
  window.setTimeout(() => {
    if (deck.generation === generation) stopDeck(deck)
  }, MUSIC_CROSSFADE_S * 1000)
}

function ramp(gain: GainNode, context: AudioContext, target: number): void {
  const now = context.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(target, now + MUSIC_CROSSFADE_S)
}

function stopDeck(deck: MusicDeck): void {
  deck.element.pause()
  deck.element.removeAttribute('src')
}
