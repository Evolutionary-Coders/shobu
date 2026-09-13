/**
 * Onde cada som mora em `public/assets/audio/`. **Nenhum outro módulo monta
 * nome de arquivo**: é a mesma regra que o manifesto do narrador já impunha
 * (`scripts/narrator/manifest.py`), e ela existe porque caminho montado em
 * dois lugares diverge no dia em que um deles muda.
 *
 * ```ts
 * sfxUrl('shot-sniper') // '/assets/audio/sfx/shot-sniper.webm'
 * ```
 */
export type SfxName =
  | 'shot-sniper'
  | 'shot-reload'
  | 'reload'
  | 'scope'
  | 'walking'
  | 'running'
  | 'landing-after-jump'
  | 'song-medal'
  | 'song-medal2'

export type MusicTrack = 'Chrome_Perimeter' | 'Blackout_Velocity' | 'Protocol_Seven'

/** A pasta é `<modelo>-<locale>`, como a bancada do narrador publica. */
export type NarratorVoice = 'vega-pt-BR' | 'athena-pt-BR' | 'ramattra-pt-BR' | 'zenyatta-pt-BR'

/** A ordem é a da lista de escolha no menu, e a primeira é o padrão. */
export const NARRATOR_VOICES: readonly NarratorVoice[] = [
  'vega-pt-BR',
  'athena-pt-BR',
  'ramattra-pt-BR',
  'zenyatta-pt-BR',
]

/** Já em caixa alta, como o menu escreve. */
export const NARRATOR_VOICE_LABELS: readonly string[] = ['VEGA', 'ATHENA', 'RAMATTRA', 'ZENYATTA']

/** Os que valem pré-carregar no primeiro gesto: somados, são 180 kB. */
export const SFX_NAMES: readonly SfxName[] = [
  'shot-sniper',
  'shot-reload',
  'reload',
  'scope',
  'walking',
  'running',
  'landing-after-jump',
  'song-medal',
  'song-medal2',
]

const AUDIO_ROOT = '/assets/audio'

export function sfxUrl(name: SfxName): string {
  return `${AUDIO_ROOT}/sfx/${name}.webm`
}

export function musicUrl(track: MusicTrack): string {
  return `${AUDIO_ROOT}/music/${track}.webm`
}

export function voicelineManifestUrl(voice: NarratorVoice): string {
  return `${AUDIO_ROOT}/voicelines/${voice}/manifest.json`
}

export function voicelineUrl(voice: NarratorVoice, file: string): string {
  return `${AUDIO_ROOT}/voicelines/${voice}/${file}`
}

/** A voz do índice do ajuste. Índice fora da lista cai no padrão, que é a vega. */
export function narratorVoiceAt(index: number): NarratorVoice {
  return NARRATOR_VOICES[index] ?? 'vega-pt-BR'
}

/** O stinger da medalha: o segundo é o das raras e lendárias. */
export function medalStingerUrl(rare: boolean): string {
  return sfxUrl(rare ? 'song-medal2' : 'song-medal')
}
