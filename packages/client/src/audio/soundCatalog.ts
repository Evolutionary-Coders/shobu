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

export type MusicTrack =
  | 'Chrome_Perimeter'
  | 'Blackout_Velocity'
  | 'Protocol_Seven'
  | 'Midnight_Pursuit'
  | 'Iron_Teeth'
  | 'Point_Blank_Pursuit'

/** A pasta é `<modelo>-<locale>`, como a bancada do narrador publica. */
export type NarratorVoice =
  | 'mestre-pt-BR'
  | 'comandante-pt-BR'
  | 'atlas-pt-BR'
  | 'vega-pt-BR'
  | 'athena-pt-BR'
  | 'ramattra-pt-BR'
  | 'zenyatta-pt-BR'

/**
 * A ordem é a da lista de escolha no menu, e a primeira é o padrão.
 *
 * **As três primeiras são personas**, cada uma com roteiro próprio
 * (`scripts/narrator/personas/`): o mesmo evento, outra frase e outra atitude.
 * São as de licença limpa — Kokoro (Apache-2.0) com efeito de ffmpeg, sem modelo de
 * timbre de terceiro (`docs/asset-licenses.md`, seção narrador):
 *
 * - **MESTRE**, o padrão: o mestre da arena — teatral, grita, ri e ama a carnificina;
 * - **COMANDANTE**: o comando tático no rádio — seco, curto, urgente;
 * - **ATLAS**: a IA da rede — fria, exata, não levanta a voz.
 *
 * As quatro de rvc seguem escolhíveis, com o risco que a seção registra.
 */
export const NARRATOR_VOICES: readonly NarratorVoice[] = [
  'mestre-pt-BR',
  'comandante-pt-BR',
  'atlas-pt-BR',
  'vega-pt-BR',
  'athena-pt-BR',
  'ramattra-pt-BR',
  'zenyatta-pt-BR',
]

/** Já em caixa alta, como o menu escreve. */
export const NARRATOR_VOICE_LABELS: readonly string[] = [
  'MESTRE',
  'COMANDANTE',
  'ATLAS',
  'VEGA',
  'ATHENA',
  'RAMATTRA',
  'ZENYATTA',
]

/**
 * Os que valem pré-carregar no primeiro gesto: somados, são 150 kB.
 *
 * **`walking` ficou de fora de propósito.** A passada de andar saiu do take de
 * correr desacelerado (`footstepLoop.ts`), e o take próprio soava mal em
 * qualquer velocidade. Ele continua convertido em `public/`, mas ninguém o
 * baixa — voltar a usá-lo é acrescentá-lo aqui.
 */
export const SFX_NAMES: readonly SfxName[] = [
  'shot-sniper',
  'shot-reload',
  'reload',
  'scope',
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

/** A voz do índice do ajuste. Índice fora da lista cai no padrão, que é o mestre. */
export function narratorVoiceAt(index: number): NarratorVoice {
  return NARRATOR_VOICES[index] ?? 'mestre-pt-BR'
}

/** O stinger da medalha: o segundo é o das raras e lendárias. */
export function medalStingerUrl(rare: boolean): string {
  return sfxUrl(rare ? 'song-medal2' : 'song-medal')
}
