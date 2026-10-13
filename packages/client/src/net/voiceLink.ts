import type { Vector3, VoiceConfig } from '@shobu/core'
import {
  AudioPresets,
  type RemoteParticipant,
  type RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import { toWebAudioSpace, type VoiceStage, voicePannerOptions } from '../audio/spatialVoice.ts'

/**
 * O canal de voz, do lado do cliente: a interface do projeto sobre o
 * `livekit-client` e o Web Audio. Adapter de rede e de áudio; quem decide
 * quando falar é `pushToTalk.ts`, e onde cada voz soa, `spatialVoice.ts`.
 */
export interface VoiceLink extends VoiceStage {
  /** Abre ou fecha o microfone. O primeiro `talk(true)` pede a permissão. */
  talk(on: boolean): void
  leave(): void
}

/** As partes de áudio de um canal: o contexto e um panner por quem fala. */
interface VoiceMix {
  readonly context: AudioContext
  readonly panners: Map<string, PannerNode>
  readonly options: PannerOptions
  readonly scratch: { x: number; y: number; z: number }
}

/**
 * Entra na sala de voz com o token que o servidor de jogo emitiu. Preset
 * `speech` (Opus a 24 kbps): o padrão do sdk é `music`, 48 kbps, e voz não
 * precisa dele. RED e DTX já vêm ligados no sdk (docs/rede, Tabela de
 * parâmetros). Cada voz recebida passa por um `PannerNode`, que a põe no
 * lugar de quem fala.
 *
 * ```ts
 * const voice = await openVoiceLink(gameServerUrl(location, 7880), ticket.token, config.voice)
 * ```
 */
export async function openVoiceLink(
  url: string,
  token: string,
  voice: VoiceConfig,
): Promise<VoiceLink> {
  const mix = createVoiceMix(voice)
  const room = new Room({ publishDefaults: { audioPreset: AudioPresets.speech } })
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) =>
    placeVoice(mix, track, participant),
  )
  room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) =>
    dropVoice(mix, track, participant),
  )
  await room.connect(url, token)
  return {
    talk: (on) => talk(room, mix, on),
    hearFrom: (eyeM, forward) => hearFrom(mix, eyeM, forward),
    placeSpeaker: (playerId, mouthM) => placeSpeaker(mix, playerId, mouthM),
    leave: () => {
      void room.disconnect()
      void mix.context.close()
    },
  }
}

/**
 * O contexto nasce suspenso até um gesto do jogador. Qualquer clique ou tecla
 * o acorda, e não só o V: quem nunca fala também precisa ouvir.
 */
function createVoiceMix(voice: VoiceConfig): VoiceMix {
  const context = new AudioContext()
  const wake = (): void => void context.resume()
  window.addEventListener('pointerdown', wake)
  window.addEventListener('keydown', wake)
  context.addEventListener('statechange', () => {
    if (context.state !== 'running') return
    window.removeEventListener('pointerdown', wake)
    window.removeEventListener('keydown', wake)
  })
  wake()
  const options = voicePannerOptions(voice)
  return { context, panners: new Map(), options, scratch: { x: 0, y: 0, z: 0 } }
}

function talk(room: Room, mix: VoiceMix, on: boolean): void {
  void mix.context.resume()
  room.localParticipant.setMicrophoneEnabled(on).catch((reason: unknown) => {
    console.warn(JSON.stringify({ event: 'voice.mic-failed', message: String(reason) }))
  })
}

/**
 * A identidade de quem fala é o `sessionId` dele na sala de jogo (o token
 * diz), então o panner é achado pelo mesmo id com que o renderer o posiciona.
 *
 * O `<audio>` mudo existe por causa do Chrome: uma faixa WebRTC remota que só
 * vai para o Web Audio sai em silêncio se nenhum elemento de mídia a consome
 * (crbug.com/933677).
 */
function placeVoice(mix: VoiceMix, track: RemoteTrack, participant: RemoteParticipant): void {
  if (track.kind !== Track.Kind.Audio) return
  const element = track.attach()
  element.muted = true
  document.body.append(element)
  const source = mix.context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]))
  const panner = new PannerNode(mix.context, mix.options)
  source.connect(panner).connect(mix.context.destination)
  mix.panners.get(participant.identity)?.disconnect()
  mix.panners.set(participant.identity, panner)
}

function dropVoice(mix: VoiceMix, track: RemoteTrack, participant: RemoteParticipant): void {
  for (const element of track.detach()) element.remove()
  mix.panners.get(participant.identity)?.disconnect()
  mix.panners.delete(participant.identity)
}

/**
 * `setPosition` e `setOrientation`, e não os `AudioParam` `positionX` e
 * `forwardX`: o Firefox não tem os `AudioParam` no ouvinte, e escrever num
 * deles lançaria a cada quadro.
 */
function hearFrom(mix: VoiceMix, eyeM: Vector3, forward: Vector3): void {
  const { listener } = mix.context
  const at = toWebAudioSpace(eyeM, mix.scratch)
  listener.setPosition(at.x, at.y, at.z)
  const ahead = toWebAudioSpace(forward, mix.scratch)
  listener.setOrientation(ahead.x, ahead.y, ahead.z, 0, 1, 0)
}

function placeSpeaker(mix: VoiceMix, playerId: string, mouthM: Vector3): void {
  const panner = mix.panners.get(playerId)
  if (!panner) return
  const at = toWebAudioSpace(mouthM, mix.scratch)
  panner.positionX.value = at.x
  panner.positionY.value = at.y
  panner.positionZ.value = at.z
}
