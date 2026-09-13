import { AUDIO_CHANNELS, type AudioChannel, type AudioMixer } from './audioMixer.ts'
import { createMusicStream, type MusicStream } from './musicStream.ts'
import { duckedGain } from './volumeMix.ts'

/**
 * O mixer de verdade: um `AudioContext`, um `GainNode` por canal e um cache de
 * buffer por url. É o único módulo do cliente que fala com a api de áudio do
 * navegador — o resto conhece só a interface `AudioMixer`.
 *
 * **O contexto nasce suspenso.** Todo navegador moderno recusa som antes de um
 * gesto do jogador, então `unlock()` sai do primeiro comando do menu e do
 * clique que entra na arena, e é idempotente porque os dois podem acontecer.
 *
 * ```ts
 * const mixer = createWebAudioMixer(window)
 * mixer.unlock()
 * mixer.play('sfx', sfxUrl('scope'))
 * ```
 */
/**
 * Só o que este módulo usa do navegador, injetado — o mesmo desenho do
 * `SettingsStorage`: a dependência entra por parâmetro, e `window` a satisfaz
 * sem nenhum adaptador no meio.
 */
export interface AudioHost {
  readonly document: Document
  readonly AudioContext: new () => AudioContext
  setTimeout(handler: () => void, timeoutMs: number): number
}

/**
 * Um laço no ar. `started` existe porque `stop()` num `AudioBufferSourceNode`
 * que nunca tocou **lança**, e aqui ele pode não ter tocado: o slot é marcado
 * antes do `await` do buffer, e trocar de ritmo antes de o download terminar é
 * o caso comum — o jogador acelera de andar para correr em poucos quadros.
 */
interface LoopSlot {
  readonly url: string
  readonly source: AudioBufferSourceNode
  started: boolean
}

interface MixerParts {
  readonly context: AudioContext
  readonly gains: Map<AudioChannel, GainNode>
  readonly buffers: Map<string, AudioBuffer>
  readonly loops: Map<string, LoopSlot>
  readonly music: MusicStream
  /** O ganho pedido pelo menu, antes de a fala do narrador abaixar a música. */
  readonly wanted: Map<AudioChannel, number>
  narrator: AudioBufferSourceNode | undefined
}

export function createWebAudioMixer(host: AudioHost): AudioMixer {
  const state = { parts: undefined as MixerParts | undefined }
  const pending = new Map<AudioChannel, number>()
  const on = <Result>(use: (parts: MixerParts) => Promise<Result>) => {
    // toda falha de áudio morre aqui: som que não sai não pode derrubar o
    // quadro nem a partida.
    if (state.parts) void use(state.parts).catch(() => {})
  }
  return {
    unlock: () => {
      state.parts ??= createParts(host, pending)
      void state.parts.context.resume().catch(() => {})
    },
    setGain: (channel, gain) => {
      pending.set(channel, gain)
      if (state.parts) writeGain(state.parts, channel, gain)
    },
    preload: (urls) => on(async (parts) => warmAll(parts, urls)),
    play: (channel, url) => on((parts) => playOnce(parts, channel, url)),
    loop: (name, channel, url) => on((parts) => setLoop(parts, name, channel, url)),
    stream: (url) => state.parts?.music.play(url),
    speak: (url) => on((parts) => speakNow(parts, url)),
    dispose: () => {
      state.parts?.music.dispose()
      void state.parts?.context.close().catch(() => {})
      state.parts = undefined
    },
  }
}

function createParts(host: AudioHost, pending: Map<AudioChannel, number>): MixerParts {
  const context = new host.AudioContext()
  const gains = new Map(AUDIO_CHANNELS.map((channel) => [channel, context.createGain()]))
  for (const gain of gains.values()) gain.connect(context.destination)
  const musicGain = gains.get('music')
  if (!musicGain) throw new Error('o canal de música tinha que existir em AUDIO_CHANNELS')
  const parts: MixerParts = {
    context,
    gains,
    buffers: new Map(),
    loops: new Map(),
    music: createMusicStream(host.document, context, musicGain, host),
    wanted: new Map(pending),
    narrator: undefined,
  }
  for (const [channel, gain] of pending) writeGain(parts, channel, gain)
  return parts
}

function writeGain(parts: MixerParts, channel: AudioChannel, gain: number): void {
  parts.wanted.set(channel, gain)
  const node = parts.gains.get(channel)
  if (!node) return
  // a música fica abaixada enquanto o narrador fala; escrever o valor cheio
  // aqui atropelaria o abafamento no meio de uma frase.
  const speaking = channel === 'music' && parts.narrator !== undefined
  node.gain.value = speaking ? duckedGain(gain) : gain
}

/**
 * O buffer é baixado uma vez e fica no cache. `fetch` e `decodeAudioData` são
 * os dois lados do mesmo custo: o primeiro tiro de uma sessão espera o
 * download, e por isso os nove efeitos são pré-carregados no `unlock()`.
 */
async function bufferOf(parts: MixerParts, url: string): Promise<AudioBuffer> {
  const cached = parts.buffers.get(url)
  if (cached) return cached
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}; esperado 200`)
  const decoded = await parts.context.decodeAudioData(await response.arrayBuffer())
  parts.buffers.set(url, decoded)
  return decoded
}

async function warmAll(parts: MixerParts, urls: readonly string[]): Promise<void> {
  await Promise.all(urls.map((url) => bufferOf(parts, url).catch(() => undefined)))
}

async function playOnce(parts: MixerParts, channel: AudioChannel, url: string): Promise<void> {
  const source = parts.context.createBufferSource()
  source.buffer = await bufferOf(parts, url)
  const gain = parts.gains.get(channel)
  if (gain) source.connect(gain)
  source.start()
}

async function setLoop(
  parts: MixerParts,
  name: string,
  channel: AudioChannel,
  url: string | undefined,
): Promise<void> {
  const current = parts.loops.get(name)
  if (current?.url === url) return
  if (current?.started) current.source.stop()
  parts.loops.delete(name)
  if (!url) return
  // a marca entra antes do `await`: duas trocas no mesmo quadro não podem
  // deixar dois laços tocando.
  const source = parts.context.createBufferSource()
  const slot: LoopSlot = { url, source, started: false }
  parts.loops.set(name, slot)
  source.loop = true
  source.buffer = await bufferOf(parts, url)
  const gain = parts.gains.get(channel)
  if (gain) source.connect(gain)
  // o slot pode ter sido trocado durante o download; então este laço já não é
  // o pedido, e tocá-lo somaria dois passos.
  if (parts.loops.get(name) !== slot) return
  source.start()
  slot.started = true
}

/**
 * A fala corta a anterior e abaixa a música enquanto dura. Quem decide *se* a
 * fala sai é a fila (`narratorQueue.ts`); aqui já chegou decidido.
 */
async function speakNow(parts: MixerParts, url: string): Promise<void> {
  parts.narrator?.stop()
  const source = parts.context.createBufferSource()
  source.buffer = await bufferOf(parts, url)
  const gain = parts.gains.get('narrator')
  if (gain) source.connect(gain)
  parts.narrator = source
  source.onended = () => {
    if (parts.narrator !== source) return
    parts.narrator = undefined
    writeGain(parts, 'music', parts.wanted.get('music') ?? 1)
  }
  writeGain(parts, 'music', parts.wanted.get('music') ?? 1)
  source.start()
}
