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
  /**
   * Shift preso: corrida tática. É a tecla **crua**, mesmo quando a arma
   * segura a corrida (`sprintHeldByWeapon`): o shift duplo da corrida plena
   * se lê nas bordas desta tecla, e uma borda inventada vira corrida plena.
   */
  readonly sprint: boolean
  /** Espaço preso. A borda de descida é lida pelo núcleo, contra o tick anterior. */
  readonly jump: boolean
  /** Tecla de agachar presa: agacha, e em corrida tática plena desliza. Mesma borda do pulo. */
  readonly crouch: boolean
  /**
   * Mira telescópica aberta. Vem do **estado da arma**, não do botão cru: o
   * disparo fecha a mira, e ler o botão direto deixaria a movimentação lenta
   * depois de um tiro que já fechou o scope.
   */
  readonly scoped: boolean
  /**
   * A arma pede para subir — mira aberta, tiro ou mira esperando — e o corpo
   * não corre (`weaponHoldsSprint`, o sprint-to-fire). Vem do **estado da
   * arma**, como o `scoped`, e mora num campo próprio em vez de apagar o
   * `sprint`: apagar a tecla fazia o shift ainda preso "descer de novo" quando
   * o tiro saía, e o núcleo lia isso como o segundo aperto da corrida plena
   * (playtest de 11/10: segurar shift e atirar ligava a corrida tática).
   */
  readonly sprintHeldByWeapon: boolean
  /**
   * Tecla do gancho presa. A descida dispara o cabo; soltar solta a corda. É
   * segurar, e não alternar, porque soltar no ponto certo do balanço é a
   * habilidade inteira da mecânica.
   */
  readonly grapple: boolean
  /**
   * A frente da câmera, em mundo, pelo mesmo motivo do `wish`: a rotação passa
   * por seno e cosseno no cliente, e o núcleo recebe o vetor pronto. Não
   * precisa vir unitário; zero é "sem mira", e o gancho disparado assim erra.
   */
  readonly aimX: number
  readonly aimY: number
  readonly aimZ: number
  /**
   * A katana na mão (ADR 0021): corrida um pouco mais rápida. Vem do **estado**
   * do corpo a corpo, não da tecla, pelo mesmo motivo do `scoped`.
   */
  readonly bladeDrawn: boolean
  /**
   * A investida da katana saiu **neste tick** (`stepArsenal`). Resultado do
   * estado do corpo a corpo, como o `scoped`: o servidor chega ao mesmo valor.
   */
  readonly dash: boolean
}

export const IDLE_INPUT: MovementInput = {
  wishX: 0,
  wishZ: 0,
  sprint: false,
  jump: false,
  crouch: false,
  scoped: false,
  sprintHeldByWeapon: false,
  grapple: false,
  aimX: 0,
  aimY: 0,
  aimZ: 0,
  bladeDrawn: false,
  dash: false,
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
  // a mira entra na posição pelo engate do gancho: NaN aqui viraria uma âncora
  // NaN, e a corda arrastaria o jogador para fora do mundo.
  if (!Number.isFinite(input.aimX + input.aimY + input.aimZ)) {
    throw new RangeError(
      `MovementInput recebeu aim [${input.aimX}, ${input.aimY}, ${input.aimZ}]; esperado três números finitos`,
    )
  }
}
