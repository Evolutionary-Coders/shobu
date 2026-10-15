import type { Vector3 } from '@shobu/core'
import { toWebAudioSpace } from './listenerSpace.ts'
import { createLoopTrack, type LoopPlayer, type LoopTrack, switchLoop } from './loopSwitch.ts'
import { busyUntil, pickVoice, type VoiceSlot } from './voicePool.ts'

/**
 * O som com posição: um `PannerNode` por voz, num pool fixo, e o ouvido do
 * `AudioContext` seguindo a câmera. Adapter fino da Web Audio — **que** som
 * toca, **quando** e **a que volume pela distância** é decidido fora daqui
 * (`botAudio.ts`, `soundFalloff.ts`), testado sem navegador.
 *
 * **`equalpower` e não `HRTF`**: o HRTF convolui cada voz com uma resposta de
 * cabeça, e com oito vozes isso é custo de cpu que o celular da feira sente;
 * o `equalpower` é um ganho por canal e já diz de que lado veio o tiro. E o
 * painel **não atenua**: `rolloffFactor` zero, porque a queda pela distância
 * é regra do jogo e já vem no ganho de cada pedido.
 *
 * Nada aqui é criado por quadro: as correntes de nós nascem na primeira vez
 * que cada voz é usada e ficam. O que nasce por som é o
 * `AudioBufferSourceNode`, que a Web Audio só deixa tocar uma vez.
 *
 * ```ts
 * const spatial = createSpatialVoices(context, sfxGain, (url) => bufferOf(parts, url))
 * spatial.placeListener(eyeM, forwardM)
 * spatial.playAt(sfxUrl('shot-sniper'), muzzleM, 0.4)
 * ```
 */
export interface SpatialVoices {
  placeListener(eyeM: Readonly<Vector3>, forwardM: Readonly<Vector3>): void
  playAt(
    url: string,
    positionM: Readonly<Vector3>,
    gain: number,
    delayS: number,
    offsetS: number,
  ): void
  loopAt(
    name: string,
    url: string | undefined,
    positionM: Readonly<Vector3>,
    gain: number,
    rate: number,
  ): void
}

/** Oito sons curtos ao mesmo tempo: três bots com tiro e ferrolho cada, e folga. */
export const ONE_SHOT_VOICES = 8

interface Chain {
  readonly panner: PannerNode
  readonly gain: GainNode
}

interface OneShotVoice extends Chain, VoiceSlot {
  source: AudioBufferSourceNode | undefined
}

interface LoopVoice extends Chain {
  readonly track: LoopTrack<AudioBufferSourceNode>
  /** Como esta voz começa e para a fonte: nasce com a voz, e não por troca. */
  readonly player: LoopPlayer<AudioBuffer, AudioBufferSourceNode>
}

export function createSpatialVoices(
  context: AudioContext,
  destination: AudioNode,
  bufferOf: (url: string) => Promise<AudioBuffer>,
): SpatialVoices {
  const pool: SpatialPool = {
    context,
    destination,
    bufferOf,
    voices: [],
    loops: new Map(),
    scratch: { x: 0, y: 0, z: 0 },
  }
  return {
    placeListener: (eyeM, forwardM) =>
      placeListener(context.listener, eyeM, forwardM, pool.scratch),
    playAt: (url, positionM, gain, delayS, offsetS) =>
      playAtPoint(pool, url, positionM, gain, delayS, offsetS),
    loopAt: (name, url, positionM, gain, rate) =>
      loopAtPoint(pool, name, url, positionM, gain, rate),
  }
}

/** As vozes de um contexto e o que elas dividem. */
interface SpatialPool {
  readonly context: AudioContext
  readonly destination: AudioNode
  readonly bufferOf: (url: string) => Promise<AudioBuffer>
  readonly voices: OneShotVoice[]
  readonly loops: Map<string, LoopVoice>
  /** O ponto já no espaço da Web Audio. Rascunho de cada chamada. */
  readonly scratch: Vector3
}

function playAtPoint(
  pool: SpatialPool,
  url: string,
  positionM: Readonly<Vector3>,
  gain: number,
  delayS: number,
  offsetS: number,
): void {
  // o ponto é copiado agora: quem chama reaproveita o vetor, e o buffer
  // pode chegar depois de ele já ter sido reescrito pelo som seguinte.
  const { x, y, z } = positionM
  void pool
    .bufferOf(url)
    .then((buffer) => {
      const voice = claimVoice(pool.context, pool.destination, pool.voices)
      pool.scratch.x = x
      pool.scratch.y = y
      pool.scratch.z = z
      aimChain(pool, voice, pool.scratch, gain)
      startOneShot(pool.context, voice, buffer, delayS, offsetS)
    })
    .catch(() => {})
}

function loopAtPoint(
  pool: SpatialPool,
  name: string,
  url: string | undefined,
  positionM: Readonly<Vector3>,
  gain: number,
  rate: number,
): void {
  const voice = pool.loops.get(name) ?? openLoop(pool, name)
  aimChain(pool, voice, positionM, gain)
  // o caso de todo quadro é o laço de sempre, só andando: a guarda vem antes
  // da função assíncrona, que criaria duas promessas por bot por quadro.
  if (voice.track.url === url && voice.track.rate === rate) return
  void switchLoop(voice.track, url, rate, voice.player).catch(() => {})
}

/** Põe a corrente no ponto, com o ganho da distância. */
function aimChain(
  pool: SpatialPool,
  chain: Chain,
  positionM: Readonly<Vector3>,
  gain: number,
): void {
  placePanner(chain.panner, toWebAudioSpace(positionM, pool.scratch))
  chain.gain.gain.value = gain
}

function createChain(context: AudioContext, destination: AudioNode): Chain {
  const panner = context.createPanner()
  panner.panningModel = 'equalpower'
  panner.distanceModel = 'linear'
  panner.rolloffFactor = 0
  const gain = context.createGain()
  panner.connect(gain)
  gain.connect(destination)
  return { panner, gain }
}

function placePanner(panner: PannerNode, audioM: Readonly<Vector3>): void {
  panner.positionX.value = audioM.x
  panner.positionY.value = audioM.y
  panner.positionZ.value = audioM.z
}

/**
 * O Firefox ainda não tem os `AudioParam` do ouvido, só os métodos antigos:
 * o ouvido aceita os dois caminhos, e o resto do jogo não sabe da diferença.
 * Os efeitos e a voz (`voiceLink.ts`) põem o ouvido por aqui.
 *
 * ```ts
 * placeListener(context.listener, eyeM, forwardM, scratch)
 * ```
 */
export function placeListener(
  listener: AudioListener,
  eyeM: Readonly<Vector3>,
  forwardM: Readonly<Vector3>,
  scratch: Vector3,
): void {
  const at = toWebAudioSpace(eyeM, scratch)
  if (listener.positionX) {
    listener.positionX.value = at.x
    listener.positionY.value = at.y
    listener.positionZ.value = at.z
  } else listener.setPosition(at.x, at.y, at.z)
  const ahead = toWebAudioSpace(forwardM, scratch)
  if (listener.forwardX) {
    listener.forwardX.value = ahead.x
    listener.forwardY.value = ahead.y
    listener.forwardZ.value = ahead.z
  } else listener.setOrientation(ahead.x, ahead.y, ahead.z, 0, 1, 0)
}

function claimVoice(
  context: AudioContext,
  destination: AudioNode,
  voices: OneShotVoice[],
): OneShotVoice {
  if (voices.length < ONE_SHOT_VOICES) {
    const voice: OneShotVoice = {
      ...createChain(context, destination),
      busyUntilS: 0,
      startedAtS: 0,
      source: undefined,
    }
    voices.push(voice)
    return voice
  }
  const voice = voices[pickVoice(voices, context.currentTime)] as OneShotVoice
  // a voz roubada ainda pode estar tocando: o som novo entra no lugar dele.
  voice.source?.stop()
  return voice
}

function startOneShot(
  context: AudioContext,
  voice: OneShotVoice,
  buffer: AudioBuffer,
  delayS: number,
  offsetS: number,
): void {
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(voice.panner)
  const nowS = context.currentTime
  source.start(nowS + delayS, offsetS)
  voice.source = source
  voice.startedAtS = nowS
  voice.busyUntilS = busyUntil(nowS, delayS, buffer.duration, offsetS, 1)
}

function openLoop(pool: SpatialPool, name: string): LoopVoice {
  const chain = createChain(pool.context, pool.destination)
  const voice: LoopVoice = {
    ...chain,
    track: createLoopTrack(),
    player: {
      bufferOf: pool.bufferOf,
      start: (buffer, rate) => startLoopSource(chain.panner, buffer, rate),
      stop: (source) => source.stop(),
    },
  }
  pool.loops.set(name, voice)
  return voice
}

function startLoopSource(
  panner: PannerNode,
  buffer: AudioBuffer,
  rate: number,
): AudioBufferSourceNode {
  const source = panner.context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  source.playbackRate.value = rate
  source.connect(panner)
  source.start()
  return source
}
