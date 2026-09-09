/**
 * Os clipes do viewmodel do sniper (`public/assets/viewmodel/sniper.glb`, de
 * DJMaesen, CC-BY-4.0). O glb traz **um** clipe, `allanims`, de 6,5 s, com as
 * poses concatenadas — idle, disparo, ferrolho e recarga saem de intervalos
 * dele, não de grupos separados. É a metade FPP da separação FPP/TPP: braços e
 * arma, nunca o corpo inteiro.
 *
 * Os intervalos vêm da leitura dos canais do glTF (`docs/asset-licenses.md`),
 * somando o movimento de todos os canais a cada décimo de segundo: o gatilho
 * em 0–0,5 s, o ferrolho e a bala em 0,5–1,9 s, o destravador e o carregador
 * em 1,9–3,6 s, um gesto de inspeção em 3,9–4,6 s, e **o trecho mais parado do
 * clipe em 4,7–5,4 s** — só dedo mexendo, e é isso que serve de idle. Em 5,5 s
 * há um corte seco de pose, então o idle não pode passar dali. Os limites são
 * dado aqui e não número solto no adapter, para o teste vigiar que nenhum
 * intervalo sai do clipe.
 */
export type ViewmodelClip = 'idle' | 'shoot' | 'bolt' | 'reload'

export interface ClipSegment {
  readonly fromS: number
  readonly toS: number
  readonly loop: boolean
  /** 1 é o ritmo autorado. O idle roda mais devagar: 0,7 s em loop cheio era dedo abrindo e fechando sem parar. */
  readonly speedRatio: number
}

export const ALLANIMS_DURATION_S = 6.5

/** O glTF é carregado a 60 quadros por segundo; `from`/`to` do babylon são quadros. */
export const GLTF_FRAMES_PER_SECOND = 60

export const VIEWMODEL_SEGMENTS: Readonly<Record<ViewmodelClip, ClipSegment>> = {
  shoot: { fromS: 0, toS: 0.5, loop: false, speedRatio: 1 },
  bolt: { fromS: 0.5, toS: 1.9, loop: false, speedRatio: 1 },
  reload: { fromS: 1.9, toS: 3.6, loop: false, speedRatio: 1 },
  // a um quarto, os 0,7 s viram um ciclo de 2,8 s: respiração, não tique.
  idle: { fromS: 4.7, toS: 5.4, loop: true, speedRatio: 0.25 },
}

export interface FrameRange {
  readonly from: number
  readonly to: number
}

/**
 * ```ts
 * segmentFrames('idle') // { from: 282, to: 324 }
 * ```
 */
export function segmentFrames(clip: ViewmodelClip): FrameRange {
  const segment = VIEWMODEL_SEGMENTS[clip]
  return {
    from: segment.fromS * GLTF_FRAMES_PER_SECOND,
    to: segment.toS * GLTF_FRAMES_PER_SECOND,
  }
}
