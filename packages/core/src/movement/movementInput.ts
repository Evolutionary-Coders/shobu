/**
 * O que o jogador pede num tick. É o dado que a rede transporta (ADR 0002), e
 * por isso a direção já vem em espaço de mundo e no plano do chão: quem tem a
 * câmera é o cliente, e a rotação dela passa por seno e cosseno, que não são
 * determinísticos entre plataformas (ADR 0003). A trigonometria fica do lado de
 * fora; o núcleo recebe o vetor pronto e o servidor recebe o mesmo vetor.
 */
export interface MovementInput {
  /** Direção desejada no plano do chão, em mundo. Comprimento até 1; zero é parado. */
  readonly wishX: number
  readonly wishZ: number
  /** Shift preso: corrida tática. */
  readonly sprint: boolean
  /** Espaço preso. A borda de descida é lida pelo núcleo, contra o tick anterior. */
  readonly jump: boolean
  /** Tecla de agachar presa: agacha, e em corrida tática plena desliza. Mesma borda do pulo. */
  readonly crouch: boolean
}

export const IDLE_INPUT: MovementInput = {
  wishX: 0,
  wishZ: 0,
  sprint: false,
  jump: false,
  crouch: false,
}

export function hasWish(input: MovementInput): boolean {
  return input.wishX !== 0 || input.wishZ !== 0
}

/**
 * Comprimento do vetor desejado. Um cliente honesto manda até 1; acima disso é
 * cliente adulterado pedindo velocidade, e é por isso que o núcleo normaliza
 * em vez de confiar — ver `wishUnit`.
 */
export function wishLength(input: MovementInput): number {
  return Math.sqrt(input.wishX * input.wishX + input.wishZ * input.wishZ)
}

/**
 * Componente unitária da direção desejada, ou zero se não há pedido. Devolve
 * escalar por eixo em vez de vetor para não alocar por tick.
 *
 * ```ts
 * wishUnit(input, 'x') * speed // velocidade desejada em x
 * ```
 */
export function wishUnit(input: MovementInput, axis: 'x' | 'z'): number {
  const length = wishLength(input)
  if (length === 0) return 0
  return (axis === 'x' ? input.wishX : input.wishZ) / length
}

/**
 * Entrada com NaN ou infinito corromperia o estado para sempre — o próximo
 * tick propaga o NaN pela posição e não há reconciliação que traga de volta.
 * Rejeitar na borda é mais barato que detectar depois.
 */
export function assertFiniteInput(input: MovementInput): void {
  if (!Number.isFinite(input.wishX) || !Number.isFinite(input.wishZ)) {
    throw new RangeError(
      `MovementInput recebeu wish [${input.wishX}, ${input.wishZ}]; esperado dois números finitos`,
    )
  }
}
