/**
 * Os clipes esqueléticos da lâmina, tocados sem o motor de animação do
 * babylon (ADR 0021). O glb traz os clipes como grupos de animação; aqui eles
 * viram tabelas planas (`Float32Array`) e são amostrados à mão, porque:
 *
 * - o babylon interpola quaternion com `Quaternion.Slerp`, que **cria** um
 *   quaternion por canal por quadro, e mistura por peso clonando valor
 *   (`competitorAnimator.ts` já pagou por isso). Aqui nada aloca por quadro;
 * - o tempo do clipe é o do diretor (`bladeDirector.ts`), que segue o golpe do
 *   núcleo, e não um relógio do motor;
 * - a troca de clipe mistura a partir da **pose congelada** em que a lâmina
 *   estava, então um golpe no meio da respiração, ou a guarda no meio de um
 *   corte, nunca estala.
 *
 * Código puro: o adapter só copia a pose para os nós dos ossos.
 */

/** Por nó: o quaternion `(x, y, z, w)` e a posição `(x, y, z)`. */
export const NODE_STRIDE = 7

/** Um canal do glb: os instantes e os valores (4 por chave no giro, 3 na posição). */
export interface ChannelTrack {
  readonly node: number
  readonly path: 'rotation' | 'position'
  readonly timesS: Float32Array
  readonly values: Float32Array
}

export interface SkeletalClip {
  readonly durationS: number
  readonly channels: readonly ChannelTrack[]
}

/**
 * A pose de um canal num instante, escrita no lugar do nó em `out`. Entre
 * duas chaves, em linha (o glb vem amostrado a 60 Hz, a curva já está nas
 * chaves); o giro em nlerp, que a 60 Hz é indistinguível do slerp.
 *
 * ```ts
 * sampleChannel(track, 0.12, pose)
 * ```
 */
export function sampleChannel(track: ChannelTrack, tS: number, out: Float32Array): void {
  const width = track.path === 'rotation' ? 4 : 3
  const at = track.node * NODE_STRIDE + (track.path === 'rotation' ? 0 : 4)
  const next = keyAfter(track.timesS, tS)
  const last = track.timesS.length - 1
  if (next <= 0 || next > last) {
    copyKey(track.values, next <= 0 ? 0 : last, width, out, at)
    return
  }
  const from = next - 1
  const start = track.timesS[from] as number
  const u = (tS - start) / ((track.timesS[next] as number) - start)
  lerpKeys(track.values, from, u, width, out, at)
  if (width === 4) normalizeQuaternion(out, at)
}

function copyKey(
  values: Float32Array,
  key: number,
  width: number,
  out: Float32Array,
  at: number,
): void {
  for (let c = 0; c < width; c += 1) out[at + c] = values[key * width + c] as number
}

/** A chave `from` andando `u` até a seguinte. */
function lerpKeys(
  values: Float32Array,
  from: number,
  u: number,
  width: number,
  out: Float32Array,
  at: number,
): void {
  for (let c = 0; c < width; c += 1) {
    const a = values[from * width + c] as number
    out[at + c] = a + ((values[(from + 1) * width + c] as number) - a) * u
  }
}

/** A primeira chave depois de `tS`, por busca binária; `length` se nenhuma. */
function keyAfter(timesS: Float32Array, tS: number): number {
  let low = 0
  let high = timesS.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((timesS[middle] as number) <= tS) low = middle + 1
    else high = middle
  }
  return low
}

function normalizeQuaternion(out: Float32Array, at: number): void {
  const x = out[at] as number
  const y = out[at + 1] as number
  const z = out[at + 2] as number
  const w = out[at + 3] as number
  const length = Math.hypot(x, y, z, w) || 1
  out[at] = x / length
  out[at + 1] = y / length
  out[at + 2] = z / length
  out[at + 3] = w / length
}

/**
 * O clipe inteiro num instante: o descanso (`rest`) para o que ele não anima,
 * e cada canal por cima.
 *
 * ```ts
 * sampleSkeletalClip(clips.get('katana_slash_1'), 0.1, rest, pose)
 * ```
 */
export function sampleSkeletalClip(
  clip: SkeletalClip,
  tS: number,
  rest: Float32Array,
  out: Float32Array,
): Float32Array {
  out.set(rest)
  for (let index = 0; index < clip.channels.length; index += 1) {
    sampleChannel(clip.channels[index] as ChannelTrack, tS, out)
  }
  return out
}

/**
 * `from` misturada com `to` por `weight` (0 é `from`), em `out`: posição em
 * linha, giro em nlerp pelo caminho curto. `out` pode ser `to`.
 *
 * ```ts
 * blendSkeletalPose(frozen, sampled, 0.5, pose)
 * ```
 */
export function blendSkeletalPose(
  from: Float32Array,
  to: Float32Array,
  weight: number,
  out: Float32Array,
): Float32Array {
  for (let at = 0; at < out.length; at += NODE_STRIDE) {
    const dot =
      (from[at] as number) * (to[at] as number) +
      (from[at + 1] as number) * (to[at + 1] as number) +
      (from[at + 2] as number) * (to[at + 2] as number) +
      (from[at + 3] as number) * (to[at + 3] as number)
    // q e -q são o mesmo giro: mistura com o que está do mesmo lado.
    const side = dot < 0 ? -1 : 1
    for (let c = 0; c < NODE_STRIDE; c += 1) {
      const a = from[at + c] as number
      const b = (to[at + c] as number) * (c < 4 ? side : 1)
      out[at + c] = a + (b - a) * weight
    }
    normalizeQuaternion(out, at)
  }
  return out
}

/** Curto: a troca para o golpe não pode atrasar a lâmina que já tem de chegar à retícula. */
export const CLIP_FADE_S = 0.06

/** A mistura da troca de clipe: a pose congelada, a amostrada e a que sai. */
export interface SkeletalMixer {
  readonly rest: Float32Array
  readonly frozen: Float32Array
  readonly sampled: Float32Array
  readonly pose: Float32Array
  fadeLeftS: number
  lastChanges: number
}

export function createSkeletalMixer(rest: Float32Array): SkeletalMixer {
  return {
    rest,
    frozen: Float32Array.from(rest),
    sampled: Float32Array.from(rest),
    pose: Float32Array.from(rest),
    fadeLeftS: 0,
    lastChanges: 0,
  }
}

/**
 * Um quadro da mistura. Quando o diretor troca de clipe (`changes` mudou), a
 * pose do quadro anterior congela e o clipe novo entra por cima dela em
 * `CLIP_FADE_S`, numa curva suave.
 *
 * ```ts
 * mixSkeletalClip(mixer, clip, shot.clipS, shot.clipChanges, frameS)
 * ```
 */
export function mixSkeletalClip(
  mixer: SkeletalMixer,
  clip: SkeletalClip,
  tS: number,
  changes: number,
  frameS: number,
): Float32Array {
  if (changes !== mixer.lastChanges) {
    mixer.lastChanges = changes
    mixer.frozen.set(mixer.pose)
    mixer.fadeLeftS = CLIP_FADE_S
  }
  sampleSkeletalClip(clip, tS, mixer.rest, mixer.sampled)
  if (mixer.fadeLeftS <= 0) {
    mixer.pose.set(mixer.sampled)
    return mixer.pose
  }
  mixer.fadeLeftS = Math.max(0, mixer.fadeLeftS - frameS)
  const u = 1 - mixer.fadeLeftS / CLIP_FADE_S
  return blendSkeletalPose(mixer.frozen, mixer.sampled, u * u * (3 - 2 * u), mixer.pose)
}

// --------------------------------------------------------------- do glb

/** O que este módulo lê de uma animação do babylon. Estrutural: o teste roda em node. */
export interface KeyedAnimation {
  readonly targetProperty: string
  readonly framePerSecond: number
  getKeys(): readonly {
    readonly frame: number
    readonly value: { x: number; y: number; z: number; w?: number }
  }[]
}

export interface AnimationGroupLike<Target> {
  readonly name: string
  readonly to: number
  readonly targetedAnimations: readonly {
    readonly target: Target
    readonly animation: KeyedAnimation
  }[]
}

/** Os nós animados (na ordem do buffer de pose) e os clipes por nome de grupo. */
export interface SkeletalLibrary<Target> {
  readonly nodes: readonly Target[]
  /** Se o clipe mexe na posição do nó, e não só no giro: só esses têm a posição escrita. */
  readonly movesPosition: readonly boolean[]
  readonly clips: ReadonlyMap<string, SkeletalClip>
}

const PATHS: Readonly<Record<string, ChannelTrack['path']>> = {
  rotationQuaternion: 'rotation',
  position: 'position',
}

/**
 * Os grupos de animação do glb em tabelas planas. A escala fica de fora: o
 * bake não a anima, e o exportador a escreve constante.
 *
 * ```ts
 * const library = readSkeletalLibrary(loaded.animationGroups)
 * ```
 */
export function readSkeletalLibrary<Target>(
  groups: readonly AnimationGroupLike<Target>[],
): SkeletalLibrary<Target> {
  const nodes: Target[] = []
  const movesPosition: boolean[] = []
  const clips = new Map<string, SkeletalClip>()
  for (const group of groups) clips.set(group.name, readClip(group, nodes, movesPosition))
  return { nodes, movesPosition: nodes.map((_, index) => movesPosition[index] === true), clips }
}

/** Um grupo, com cada alvo novo entrando no fim da lista de nós. */
function readClip<Target>(
  group: AnimationGroupLike<Target>,
  nodes: Target[],
  movesPosition: boolean[],
): SkeletalClip {
  const channels: ChannelTrack[] = []
  let fps = 60
  for (const { target, animation } of group.targetedAnimations) {
    const path = PATHS[animation.targetProperty]
    if (!path) continue
    const known = nodes.indexOf(target)
    const node = known < 0 ? nodes.push(target) - 1 : known
    if (path === 'position') movesPosition[node] = true
    fps = animation.framePerSecond
    channels.push(flattenChannel(node, path, animation))
  }
  return { durationS: group.to / fps, channels }
}

function flattenChannel(
  node: number,
  path: ChannelTrack['path'],
  animation: KeyedAnimation,
): ChannelTrack {
  const keys = animation.getKeys()
  const width = path === 'rotation' ? 4 : 3
  const timesS = new Float32Array(keys.length)
  const values = new Float32Array(keys.length * width)
  keys.forEach((key, index) => {
    timesS[index] = key.frame / animation.framePerSecond
    values.set([key.value.x, key.value.y, key.value.z], index * width)
    if (width === 4) values[index * width + 3] = key.value.w ?? 1
  })
  return { node, path, timesS, values }
}
