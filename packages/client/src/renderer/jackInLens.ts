/**
 * O lado do mundo da transição de entrada: no instante em que o jogador ganha o
 * controle a lente está fechada — fov mais estreito, a visão de quem acaba de
 * acordar — e abre até o fov base enquanto a tela de boot se desmonta por cima.
 * É o que faz a arena **chegar** em vez de estar parada atrás de uma cortina.
 *
 * Isto é render, não simulação: mexe no fov, nunca na posição do jogador, e o
 * mouse continua respondendo desde o primeiro quadro. Um fov animado não
 * disputa o controle com o jogador; uma câmera girando sozinha disputaria, e é
 * por isso que só a lente se move.
 *
 * A lente **não escreve na câmera**: devolve um multiplicador e quem compõe o
 * fov final é `firstPersonLens.ts`. Antes ela escrevia direto, e a luneta
 * também quer escrever — dois donos do mesmo campo é último-a-escrever-ganha,
 * esperando o primeiro jogador que segurar o botão direito durante a abertura.
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

export interface JackInLens {
  /** Fecha a lente e a deixa abrir ao longo dos próximos quadros. */
  play(): void
  /** Multiplicador do fov base neste instante; 1 quando a lente está aberta. */
  scale(): number
}

/**
 * ```ts
 * const lens = createJackInLens(() => performance.now())
 * lens.play()
 * lens.scale() // 0.82, subindo a cada quadro até 1
 * ```
 */
export function createJackInLens(now: () => number): JackInLens {
  let startedAt: number | undefined
  return {
    play: () => {
      startedAt = now()
    },
    scale: () => {
      if (startedAt === undefined) return 1
      const elapsedMs = now() - startedAt
      if (elapsedMs >= LENS_OPEN_MS) {
        startedAt = undefined
        return 1
      }
      return lensFovScale(elapsedMs)
    },
  }
}
