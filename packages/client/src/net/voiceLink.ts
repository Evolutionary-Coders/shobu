import { AudioPresets, type RemoteTrack, Room, RoomEvent, Track } from 'livekit-client'

/**
 * O canal de voz, do lado do cliente: a interface do projeto sobre o
 * `livekit-client`. Adapter de rede; quem decide quando falar é
 * `pushToTalk.ts`.
 */
export interface VoiceLink {
  /** Abre ou fecha o microfone. O primeiro `talk(true)` pede a permissão. */
  talk(on: boolean): void
  leave(): void
}

/**
 * Entra na sala de voz com o token que o servidor de jogo emitiu. Preset
 * `speech` (Opus a 24 kbps): o padrão do sdk é `music`, 48 kbps, e voz não
 * precisa dele. RED e DTX já vêm ligados no sdk (docs/rede, Tabela de
 * parâmetros).
 *
 * ```ts
 * const voice = await openVoiceLink(gameServerUrl(location, 7880), ticket.token)
 * ```
 */
export async function openVoiceLink(url: string, token: string): Promise<VoiceLink> {
  const room = new Room({ publishDefaults: { audioPreset: AudioPresets.speech } })
  room.on(RoomEvent.TrackSubscribed, playRemoteAudio)
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    for (const element of track.detach()) element.remove()
  })
  await room.connect(url, token)
  return {
    talk: (on) => {
      room.localParticipant.setMicrophoneEnabled(on).catch((reason: unknown) => {
        console.warn(JSON.stringify({ event: 'voice.mic-failed', message: String(reason) }))
      })
    },
    leave: () => void room.disconnect(),
  }
}

/** O sdk não toca o áudio sozinho: cada faixa recebida ganha um `<audio>`. */
function playRemoteAudio(track: RemoteTrack): void {
  if (track.kind !== Track.Kind.Audio) return
  document.body.append(track.attach())
}
