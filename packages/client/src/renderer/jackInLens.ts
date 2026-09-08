/**
 * O lado do mundo da transição de entrada: no instante em que o jogador ganha o
 * controle a lente está fechada — fov mais estreito, a visão de quem acaba de
 * acordar — e abre até o fov base enquanto a tela de boot se desmonta por cima.
 * É o que faz a arena **chegar** em vez de estar parada atrás de uma cortina.
 *
 * Isto é render, não simulação: mexe na câmera, nunca na posição do jogador, e
 * o mouse continua respondendo desde o primeiro quadro. Um fov animado não
 * disputa o controle com o jogador; uma câmera girando sozinha disputaria, e é
 * por isso que só a lente se move.
 *
 * Roda dentro do laço de render do babylon, não em javascript solto: é o mesmo
 * quadro, então não há disputa — o argumento do nfr.md contra animação em js
 * vale para quem compete com o laço, não para quem faz parte dele.
 */

/** Casado com o foco da `.jack-vision` em jackIn.css: a lente e o foco abrem juntos. */
export const LENS_OPEN_MS = 700

/**
 * 0.82 e não 0.6: abaixo disso a abertura vira zoom e zoom no primeiro quadro
 * jogável desorienta quem já está mirando. É um piscar de olho, não um dolly.
 */
export const LENS_CLOSED_SCALE = 0.82

/**
 * Multiplicador do fov base em um instante da abertura. Saída cúbica: abre
 * rápido e assenta devagar, o mesmo desenho do `logo-slam` da intro.
 *
 * ```ts
 * lensFovScale(0) // 0.82
 * lensFovScale(LENS_OPEN_MS) // 1
 * ```
 */
export function lensFovScale(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs)) {
    throw new RangeError(`elapsedMs recebeu ${elapsedMs}; esperado número finito`)
  }
  const progress = Math.min(1, Math.max(0, elapsedMs / LENS_OPEN_MS))
  const eased = 1 - (1 - progress) ** 3
  return LENS_CLOSED_SCALE + (1 - LENS_CLOSED_SCALE) * eased
}

/** O que a lente precisa da câmera. Estrutural para o teste não precisar do babylon. */
export interface LensCamera {
  fov: number
}

/** O que a lente precisa da cena: um gancho por quadro. */
export interface LensRenderLoop {
  readonly onBeforeRenderObservable: { add(step: () => void): unknown }
}

export interface JackInLens {
  /** Fecha a lente e a deixa abrir ao longo dos próximos quadros. */
  play(): void
}

/**
 * O fov base é lido **uma vez**, na criação: se fosse lido a cada `play()`, um
 * esc seguido de reentrada no meio da abertura capturaria um fov já estreitado
 * como base, e cada reentrada afunilaria a visão um pouco mais.
 *
 * ```ts
 * const lens = createJackInLens(scene, camera, () => performance.now())
 * lens.play()
 * ```
 */
export function createJackInLens(
  scene: LensRenderLoop,
  camera: LensCamera,
  now: () => number,
): JackInLens {
  const baseFov = camera.fov
  let startedAt: number | undefined
  const step = (): void => {
    if (startedAt === undefined) return
    const elapsedMs = now() - startedAt
    camera.fov = baseFov * lensFovScale(elapsedMs)
    if (elapsedMs >= LENS_OPEN_MS) startedAt = undefined
  }
  scene.onBeforeRenderObservable.add(step)
  return {
    play: () => {
      startedAt = now()
    },
  }
}
