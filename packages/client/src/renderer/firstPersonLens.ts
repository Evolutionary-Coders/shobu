import { verticalFovRad } from './fieldOfView.ts'
import type { JackInLens } from './jackInLens.ts'

/** O que a lente escreve. Estrutural para o teste não precisar do babylon. */
export interface LensTarget {
  fov: number
}

/** O que a lente precisa da cena: um gancho por quadro. */
export interface LensRenderLoop {
  readonly onBeforeRenderObservable: { add(step: () => void): unknown }
}

export interface FirstPersonLensOptions {
  readonly worldCamera: LensTarget
  /** A câmera do viewmodel, que tem fov próprio e **não** sofre a lente de entrada. */
  readonly viewmodelCamera: LensTarget
  readonly aspectRatio: () => number
  /** Fov horizontal do mundo neste quadro, em graus — a luneta manda aqui. */
  readonly horizontalFovDeg: () => number
  /** Fov horizontal do viewmodel, em graus. Constante, mas lido igual para o resize valer. */
  readonly viewmodelFovDeg: number
  readonly jackIn: JackInLens
}

/**
 * O **único** dono do fov das duas câmeras. A lente de entrada e a luneta
 * querem os dois mexer no mesmo número, e composição num lugar só é o que
 * impede uma apagar a outra.
 *
 * Ler a proporção de tela a cada quadro conserta de quebra o fov que era
 * calculado uma vez na criação da câmera e nunca mais: redimensionar a janela
 * deixava o enquadramento errado até recarregar.
 *
 * A abertura da lente **não** se aplica ao viewmodel: a arma não pode respirar
 * na entrada, ela já está na mão do jogador.
 *
 * ```ts
 * driveFirstPersonLens(scene, { worldCamera, viewmodelCamera, aspectRatio, ... })
 * ```
 */
export function driveFirstPersonLens(scene: LensRenderLoop, options: FirstPersonLensOptions): void {
  scene.onBeforeRenderObservable.add(() => {
    const aspectRatio = options.aspectRatio()
    const scale = options.jackIn.scale()
    options.worldCamera.fov = verticalFovRad(options.horizontalFovDeg(), aspectRatio) * scale
    options.viewmodelCamera.fov = verticalFovRad(options.viewmodelFovDeg, aspectRatio)
  })
}
