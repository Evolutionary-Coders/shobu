import type { Vector3 } from '@shobu/core'
import type { SfxName } from './soundCatalog.ts'

/**
 * Quanto um som de outro combatente perde com a distância. A conta mora aqui,
 * e não no `PannerNode`: o painel do navegador só decide **de que lado** o som
 * vem (`webAudioSpatial.ts`), e o volume pela distância é regra do jogo — o
 * tiro de sniper é o som que denuncia a posição de quem atirou, e tem que
 * atravessar o mapa; a passada só entrega quem está perto.
 */
export interface SoundFalloff {
  /** Até aqui, volume cheio. */
  readonly fullWithinM: number
  /** Daqui em diante, silêncio — e o som nem pede voz ao mixer. */
  readonly silentBeyondM: number
}

/**
 * Por som. O tiro chega do outro lado do Ichiban-gai (cerca de 120 m na
 * diagonal); ferrolho e recarga são cliques, que se ouvem a meia rua; a
 * passada e a aterrissagem, só de perto, como nos jogos do gênero (~22 m).
 */
export const SOUND_FALLOFF: Readonly<Record<SfxName, SoundFalloff>> = {
  'shot-sniper': { fullWithinM: 12, silentBeyondM: 160 },
  'shot-reload': { fullWithinM: 4, silentBeyondM: 35 },
  reload: { fullWithinM: 4, silentBeyondM: 30 },
  scope: { fullWithinM: 2, silentBeyondM: 12 },
  walking: { fullWithinM: 3, silentBeyondM: 22 },
  running: { fullWithinM: 3, silentBeyondM: 22 },
  'landing-after-jump': { fullWithinM: 3, silentBeyondM: 22 },
  'song-medal': { fullWithinM: 1, silentBeyondM: 1 },
  'song-medal2': { fullWithinM: 1, silentBeyondM: 1 },
}

/**
 * A última quarta parte do alcance é a borda: o volume desce a zero nela, em
 * vez de o som sumir de um quadro para o outro quando alguém cruza o limite.
 */
const EDGE_FRACTION = 0.25

/**
 * O ganho pela distância, de 0 a 1: cheio até `fullWithinM`, depois o inverso
 * da distância (é como o som cai no ar livre), e uma borda que leva a zero em
 * `silentBeyondM`.
 *
 * ```ts
 * audibleGain(60, SOUND_FALLOFF['shot-sniper']) // 0.2
 * audibleGain(30, SOUND_FALLOFF.running) // 0
 * ```
 */
export function audibleGain(distanceM: number, falloff: SoundFalloff): number {
  if (distanceM >= falloff.silentBeyondM) return 0
  const spread = Math.min(1, falloff.fullWithinM / Math.max(distanceM, falloff.fullWithinM))
  const edgeM = falloff.silentBeyondM * EDGE_FRACTION
  return spread * Math.min(1, (falloff.silentBeyondM - distanceM) / edgeM)
}

/** A distância entre dois pontos do mundo, para o ganho. */
export function distanceBetweenM(a: Readonly<Vector3>, b: Readonly<Vector3>): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}
