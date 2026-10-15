import {
  AudioPresets,
  type RemoteParticipant,
  type RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import type { AudioMixer } from '../audio/audioMixer.ts'

/**
 * O canal de voz, do lado do cliente: a interface do projeto sobre o
 * `livekit-client`. Adapter de rede; quem decide quando falar é
 * `pushToTalk.ts`, e a voz de cada um toca no mixer, no canal de voz
 * (`webAudioVoiceChat.ts`), com o volume do menu.
 */
export interface VoiceLink {
  /** Abre ou fecha o microfone. O primeiro `talk(true)` pede a permissão. */
  talk(on: boolean): void
  leave(): void
}

/** Quem toca as vozes: o mixer, pelo id de quem fala. */
type VoiceSpeakers = Pick<AudioMixer, 'hearVoice'>

/**
 * Entra na sala de voz com o token que o servidor de jogo emitiu. Preset
 * `speech` (Opus a 24 kbps): o padrão do sdk é `music`, 48 kbps, e voz não
 * precisa dele. RED e DTX já vêm ligados no sdk (docs/rede, Tabela de
 * parâmetros). Cada voz recebida vai para o mixer, que a põe no lugar de quem
 * fala.
 *
 * ```ts
 * const voice = await openVoiceLink(gameServerUrl(location, 7880), ticket.token, audio.mixer)
 * ```
 */
export async function openVoiceLink(
  url: string,
  token: string,
  speakers: VoiceSpeakers,
): Promise<VoiceLink> {
  const heard = new Set<string>()
  const room = new Room({ publishDefaults: { audioPreset: AudioPresets.speech } })
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) =>
    hearVoice(speakers, heard, track, participant),
  )
  room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) =>
    dropVoice(speakers, heard, track, participant),
  )
  await room.connect(url, token)
  return {
    talk: (on) => talk(room, on),
    leave: () => {
      void room.disconnect()
      // a sala de voz seguinte é outra: ninguém desta continua soando.
      for (const speakerId of heard) speakers.hearVoice(speakerId, undefined)
      heard.clear()
    },
  }
}

function talk(room: Room, on: boolean): void {
  room.localParticipant.setMicrophoneEnabled(on).catch((reason: unknown) => {
    console.warn(JSON.stringify({ event: 'voice.mic-failed', message: String(reason) }))
  })
}

/**
 * A identidade de quem fala é o `sessionId` dele na sala de jogo (o token
 * diz), então a voz é achada pelo mesmo id com que o renderer a posiciona.
 *
 * O `<audio>` mudo existe por causa do Chrome: uma faixa WebRTC remota que só
 * vai para o Web Audio sai em silêncio se nenhum elemento de mídia a consome
 * (crbug.com/933677).
 */
function hearVoice(
  speakers: VoiceSpeakers,
  heard: Set<string>,
  track: RemoteTrack,
  participant: RemoteParticipant,
): void {
  if (track.kind !== Track.Kind.Audio) return
  const element = track.attach()
  element.muted = true
  document.body.append(element)
  heard.add(participant.identity)
  speakers.hearVoice(participant.identity, track.mediaStreamTrack)
}

function dropVoice(
  speakers: VoiceSpeakers,
  heard: Set<string>,
  track: RemoteTrack,
  participant: RemoteParticipant,
): void {
  for (const element of track.detach()) element.remove()
  if (track.kind !== Track.Kind.Audio) return
  heard.delete(participant.identity)
  speakers.hearVoice(participant.identity, undefined)
}
