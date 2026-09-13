import {
  IDLE_FRAME,
  speedRatioFor,
  VIEWMODEL_SEGMENTS,
  type ViewmodelClip,
} from '../character/viewmodelClips.ts'

/** O que este módulo usa de `AnimationGroup`. Estrutural: o teste roda em node. */
export interface ClipPlayer {
  stop(): void
  start(loop: boolean, speedRatio: number, from: number, to: number): unknown
  goToFrame(frame: number): unknown
  pause(): unknown
}

/** Quanto tempo o jogo dá a cada gesto. Vem do `config/gameplay.json`. */
export interface ClipTempo {
  readonly boltCycleS: number
  readonly reloadS: number
}

export interface ViewmodelAnimator {
  /**
   * Chame todo quadro com o clipe da fase da arma, ou `undefined` para a pose
   * parada. Só mexe na engine quando o clipe muda.
   */
  play(clip: ViewmodelClip | undefined): void
}

/**
 * Congela o rig num quadro.
 *
 * `start` antes de `goToFrame` porque o babylon ignora `goToFrame` num grupo
 * que não foi iniciado, e a janela de um quadro só é o que impede a animação
 * escapar entre o `start` e o `pause`.
 */
export function freezeAtFrame(group: ClipPlayer, frame: number): void {
  group.stop()
  group.start(true, 1, frame, frame + 1)
  group.goToFrame(frame)
  group.pause()
}

/**
 * Toca os gestos da arma sem misturar nada: todo limite de segmento cai numa
 * pose de descanso do `allanims` (ver `REST_FRAMES`), então o corte entre dois
 * clipes acontece entre duas poses idênticas. É por isso que este módulo não
 * tem o crossfade por peso do `competitorAnimator.ts` — ali o asset obriga,
 * aqui seria maquinaria para não fazer diferença nenhuma.
 *
 * Sem relógio e sem `onAnimationGroupEndObservable`: quem é dono do tempo da
 * arma é o núcleo, e este módulo só reage à fase que ele reporta. Quando o
 * clipe acaba, a fase muda e o `play(undefined)` seguinte congela numa pose
 * idêntica ao último quadro do clipe.
 *
 * ```ts
 * const animator = createViewmodelAnimator(group, { boltCycleS: 1.3, reloadS: 2.4 })
 * animator.play('shoot')
 * ```
 */
export function createViewmodelAnimator(group: ClipPlayer, tempo: ClipTempo): ViewmodelAnimator {
  let current: ViewmodelClip | undefined
  let started = false
  const play = (clip: ViewmodelClip | undefined): void => {
    if (started && clip === current) return
    started = true
    current = clip
    if (clip === undefined) {
      freezeAtFrame(group, IDLE_FRAME)
      return
    }
    const { fromFrame, toFrame } = VIEWMODEL_SEGMENTS[clip]
    group.stop()
    group.start(false, speedRatioFor(clip, targetDurationS(clip, tempo)), fromFrame, toFrame)
  }
  play(undefined)
  return { play }
}

/** O disparo é o único gesto sem número próprio: ele é o começo do ciclo de ferrolho. */
function targetDurationS(clip: ViewmodelClip, tempo: ClipTempo): number {
  if (clip === 'reload') return tempo.reloadS
  if (clip === 'bolt') return tempo.boltCycleS
  return VIEWMODEL_SEGMENTS.shoot.toFrame / 60
}
