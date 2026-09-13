import type { AudioMixer } from './audioMixer.ts'
import { type NarratorManifest, parseNarratorManifest, pickTake } from './narratorManifest.ts'
import { createNarratorQueue, type NarratorQueue } from './narratorQueue.ts'
import { type NarratorVoice, voicelineManifestUrl, voicelineUrl } from './soundCatalog.ts'

/**
 * O narrador: uma voz de cada vez, o manifesto dela em memória e a fila que
 * decide quem fala. É adapter porque busca o manifesto na rede — a decisão de
 * *se* a fala sai é do `narratorQueue.ts`, e a de *qual take* é do
 * `narratorManifest.ts`, os dois testados sem navegador.
 *
 * **Só a voz escolhida é baixada**, e cada take só na primeira vez que toca:
 * são quatro pacotes de ~600 kB, e três deles nunca são ouvidos numa sessão.
 *
 * ```ts
 * const narrator = createNarrator(mixer, () => Math.random())
 * narrator.setVoice('vega-pt-BR')
 * narrator.say('double-kill', medalPriority('incomum'), session.matchTimeS)
 * ```
 */
export interface Narrator {
  /** Troca a voz e busca o manifesto dela. Repetir a mesma voz não busca de novo. */
  setVoice(voice: NarratorVoice): void
  /** Pede uma fala. A fila decide se ela sai, corta a anterior, ou é descartada. */
  say(slug: string, priority: number, nowS: number): void
}

interface NarratorState {
  voice: NarratorVoice | undefined
  manifest: NarratorManifest | undefined
}

export function createNarrator(
  mixer: AudioMixer,
  unit: () => number,
  queue: NarratorQueue = createNarratorQueue(),
): Narrator {
  const state: NarratorState = { voice: undefined, manifest: undefined }
  return {
    setVoice: (voice) => {
      if (state.voice === voice) return
      state.voice = voice
      state.manifest = undefined
      void loadManifest(state, voice).catch(() => {})
    },
    say: (slug, priority, nowS) => {
      const url = takeUrl(state, slug, unit())
      // a fila só é consultada quando existe fala: descartar por cooldown uma
      // fala que nem existe deixaria a próxima, que existe, calada.
      if (url && queue.request(priority, nowS)) mixer.speak(url)
    },
  }
}

async function loadManifest(state: NarratorState, voice: NarratorVoice): Promise<void> {
  const response = await fetch(voicelineManifestUrl(voice))
  if (!response.ok) {
    throw new Error(`${voicelineManifestUrl(voice)} respondeu ${response.status}; esperado 200`)
  }
  const manifest = parseNarratorManifest(await response.json())
  // a voz pode ter trocado durante a busca; o manifesto atrasado é descartado.
  if (state.voice === voice) state.manifest = manifest
}

function takeUrl(state: NarratorState, slug: string, unit: number): string | undefined {
  const { voice, manifest } = state
  if (!voice || !manifest) return undefined
  const take = pickTake(manifest, slug, unit)
  return take && voicelineUrl(voice, take.file)
}
