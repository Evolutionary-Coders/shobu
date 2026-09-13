/**
 * O mixer visto de fora: três canais de volume independentes e quatro jeitos
 * de tocar. É esta interface que o resto do cliente conhece — quem fala com o
 * `AudioContext` é o `webAudioMixer.ts`, e nada além dele.
 *
 * A divisão segue a mesma razão do `playerSettingsStore.ts`: a trava de
 * cobertura não reconhece áudio como marca de adapter, então a lógica (que
 * som, a que volume, em que ordem) vive fora, testada sem navegador, e o
 * adapter fica com o que só um navegador sabe fazer.
 *
 * ```ts
 * mixer.setGain('sfx', channelGain(settings.sfxVolume))
 * mixer.play('sfx', sfxUrl('shot-sniper'))
 * ```
 */
export type AudioChannel = 'music' | 'sfx' | 'narrator'

export const AUDIO_CHANNELS: readonly AudioChannel[] = ['music', 'sfx', 'narrator']

export interface AudioMixer {
  /**
   * Liga o áudio. **Idempotente, e só vale dentro de um gesto do jogador**: o
   * `AudioContext` nasce suspenso em todo navegador moderno, e chamar isto no
   * fim do boot não faz som nenhum sair.
   */
  unlock(): void
  setGain(channel: AudioChannel, gain: number): void
  /**
   * Baixa e decodifica sem tocar. Sai junto do `unlock`, para o primeiro tiro
   * da sessão não esperar o download do próprio som.
   */
  preload(urls: readonly string[]): void
  /** Um som curto. Duas chamadas seguidas se sobrepõem, como um tiro deve. */
  play(channel: AudioChannel, url: string): void
  /**
   * O laço nomeado de um canal. `undefined` cala aquele laço; url diferente
   * troca. Chamar com a mesma url não reinicia nada — é o que permite chamar
   * por quadro sem picotar o passo.
   */
  loop(name: string, channel: AudioChannel, url: string | undefined): void
  /** A música, por streaming e com cruzamento. `undefined` cala. */
  stream(url: string | undefined): void
  /** A fala do narrador: corta a anterior e abaixa a música enquanto dura. */
  speak(url: string): void
  dispose(): void
}

/**
 * Mixer que não faz nada, no molde do `createSilentHud`. É o que o renderer
 * usa quando não há áudio montado — um teste, ou um canvas sem a tela em
 * volta.
 */
export function createSilentMixer(): AudioMixer {
  return {
    unlock: () => {},
    setGain: () => {},
    preload: () => {},
    play: () => {},
    loop: () => {},
    stream: () => {},
    speak: () => {},
    dispose: () => {},
  }
}
