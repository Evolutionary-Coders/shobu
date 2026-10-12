import { AUDIO_CHANNELS, type AudioChannel, type AudioMixer } from './audioMixer.ts'
import { createLatestRequest, type LatestRequest } from './latestRequest.ts'
import { createMusicStream, type MusicStream } from './musicStream.ts'
import type { SpeechCue } from './narratorCaptions.ts'
import { duckedGain } from './volumeMix.ts'
import { createSpatialVoices, type SpatialVoices } from './webAudioSpatial.ts'

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
  /** Trocar de velocidade troca o laço: é o que separa andar de correr. */
  readonly rate: number
  readonly source: AudioBufferSourceNode
  started: boolean
}

interface MixerParts {
  readonly context: AudioContext
  readonly gains: Map<AudioChannel, GainNode>
  readonly buffers: Map<string, AudioBuffer>
  readonly loops: Map<string, LoopSlot>
  readonly music: MusicStream
  /** Os sons com posição, no canal de efeitos (`webAudioSpatial.ts`). */
  readonly spatial: SpatialVoices
  /** O ganho pedido pelo menu, antes de a fala do narrador abaixar a música. */
  readonly wanted: Map<AudioChannel, number>
  narrator: AudioBufferSourceNode | undefined
  /** A fala pedida por último (`latestRequest.ts`): só ela toca depois do download. */
  readonly speech: LatestRequest
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
    unlock: () => wake(state, host, pending),
    setGain: (channel, gain) => {
      pending.set(channel, gain)
      if (state.parts) writeGain(state.parts, channel, gain)
    },
    preload: (urls) => on(async (parts) => warmAll(parts, urls)),
    play: (channel, url, delayS, offsetS) =>
      on((parts) => playOnce(parts, channel, url, delayS ?? 0, offsetS ?? 0)),
    loop: (name, channel, url, rate) =>
      on((parts) => setLoop(parts, name, channel, url, rate ?? 1)),
    ...spatialMethods(state),
    stream: (playlist) => state.parts?.music.play(playlist),
    speak: (url, cue) => on((parts) => speakNow(parts, url, cue)),
    dispose: () => closeParts(state),
  }
}

function closeParts(state: { parts: MixerParts | undefined }): void {
  state.parts?.music.dispose()
  void state.parts?.context.close().catch(() => {})
  state.parts = undefined
}

/** Os sons com posição, que só existem depois do `unlock`, como o resto. */
function spatialMethods(state: {
  parts: MixerParts | undefined
}): Pick<AudioMixer, 'placeListener' | 'playAt' | 'loopAt'> {
  return {
    placeListener: (eyeM, forwardM) => state.parts?.spatial.placeListener(eyeM, forwardM),
    playAt: (url, positionM, gain, delayS, offsetS) =>
      state.parts?.spatial.playAt(url, positionM, gain, delayS ?? 0, offsetS ?? 0),
    loopAt: (name, url, positionM, gain, rate) =>
      state.parts?.spatial.loopAt(name, url, positionM, gain, rate ?? 1),
  }
}

/**
 * `new AudioContext()` lança em navegador sem a api e quando o limite de
 * contextos estoura, e `unlock` sai de dentro do tratador de teclado do menu
 * (`main.ts`): deixar isso subir travaria o menu inteiro. Jogo mudo é
 * aceitável, jogo que não entra não é.
 */
function wake(
  state: { parts: MixerParts | undefined },
  host: AudioHost,
  pending: Map<AudioChannel, number>,
): void {
  try {
    state.parts ??= createParts(host, pending)
  } catch {
    return
  }
  void state.parts.context.resume().catch(() => {})
}

function createParts(host: AudioHost, pending: Map<AudioChannel, number>): MixerParts {
  const context = new host.AudioContext()
  const gains = new Map(AUDIO_CHANNELS.map((channel) => [channel, context.createGain()]))
  for (const gain of gains.values()) gain.connect(context.destination)
  const musicGain = gains.get('music')
  const sfxGain = gains.get('sfx')
  if (!musicGain || !sfxGain) {
    throw new Error('os canais de música e de efeitos tinham que existir em AUDIO_CHANNELS')
  }
  const buffers = new Map<string, AudioBuffer>()
  const parts: MixerParts = {
    context,
    gains,
    buffers,
    loops: new Map(),
    music: createMusicStream(host.document, context, musicGain, host),
    // o cache de buffers é o mesmo do resto do mixer: o tiro do bot e o do
    // jogador são o mesmo arquivo, baixado uma vez.
    spatial: createSpatialVoices(context, sfxGain, (url) => cachedBuffer(context, buffers, url)),
    wanted: new Map(pending),
    narrator: undefined,
    speech: createLatestRequest(),
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
function bufferOf(parts: MixerParts, url: string): Promise<AudioBuffer> {
  return cachedBuffer(parts.context, parts.buffers, url)
}

async function cachedBuffer(
  context: AudioContext,
  buffers: Map<string, AudioBuffer>,
  url: string,
): Promise<AudioBuffer> {
  const cached = buffers.get(url)
  if (cached) return cached
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}; esperado 200`)
  const decoded = await context.decodeAudioData(await response.arrayBuffer())
  buffers.set(url, decoded)
  return decoded
}

async function warmAll(parts: MixerParts, urls: readonly string[]): Promise<void> {
  await Promise.all(urls.map((url) => bufferOf(parts, url).catch(() => undefined)))
}

async function playOnce(
  parts: MixerParts,
  channel: AudioChannel,
  url: string,
  delayS: number,
  offsetS: number,
): Promise<void> {
  const source = parts.context.createBufferSource()
  source.buffer = await bufferOf(parts, url)
  const gain = parts.gains.get(channel)
  if (gain) source.connect(gain)
  // o agendamento é do relógio do próprio `AudioContext`, e não de um
  // `setTimeout`: um timer de javascript erra dezenas de milissegundos quando
  // o quadro atrasa, e é justamente de dezenas de milissegundos que o
  // alinhamento do ferrolho depende.
  source.start(parts.context.currentTime + delayS, offsetS)
}

async function setLoop(
  parts: MixerParts,
  name: string,
  channel: AudioChannel,
  url: string | undefined,
  rate: number,
): Promise<void> {
  const current = parts.loops.get(name)
  if (current && current.url === url && current.rate === rate) return
  if (current?.started) current.source.stop()
  parts.loops.delete(name)
  if (!url) return
  // a marca entra antes do `await`: duas trocas no mesmo quadro não podem
  // deixar dois laços tocando.
  const source = parts.context.createBufferSource()
  const slot: LoopSlot = { url, rate, source, started: false }
  parts.loops.set(name, slot)
  source.loop = true
  source.playbackRate.value = rate
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
 *
 * O número entra antes do download, e o corte só depois dele: duas falas
 * baixando juntas cortavam, cada uma, só a que estava no ar, e a que chegasse
 * por último tocava por cima da outra — inclusive a velha, de prioridade menor.
 */
async function speakNow(parts: MixerParts, url: string, cue?: SpeechCue): Promise<void> {
  const ticket = parts.speech.stamp()
  const source = parts.context.createBufferSource()
  source.buffer = await bufferOf(parts, url)
  if (!parts.speech.isLatest(ticket)) {
    // a fila já trocou esta fala por outra: ela nunca soa, e a legenda dela
    // fica sabendo — sem `started`, o `ended` não apaga a de ninguém.
    cue?.ended()
    return
  }
  const gain = parts.gains.get('narrator')
  if (gain) source.connect(gain)
  parts.narrator?.stop()
  parts.narrator = source
  source.onended = () => {
    // a legenda ouve todo fim, cortado ou não: quem decide se ele ainda vale
    // é ela (`narratorCaptions.ts`), que sabe qual fala está no ar.
    cue?.ended()
    if (parts.narrator !== source) return
    parts.narrator = undefined
    writeGain(parts, 'music', parts.wanted.get('music') ?? 1)
  }
  writeGain(parts, 'music', parts.wanted.get('music') ?? 1)
  source.start()
  cue?.started()
}
