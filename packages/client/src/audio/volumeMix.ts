/**
 * O ajuste do menu, de 0 a 100, vira ganho de 0 a 1.
 *
 * **Ao quadrado, e não linear.** O ouvido é logarítmico: com ganho linear, a
 * metade do cursor já soa perto do volume cheio, e toda a diferença audível
 * fica espremida no primeiro quarto do curso. O quadrado é a aproximação
 * barata que espalha a mudança pelo cursor inteiro.
 *
 * ```ts
 * channelGain(50) // 0.25
 * ```
 */
export function channelGain(percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new RangeError(`channelGain recebeu ${percent}; esperado número finito`)
  }
  const unit = Math.min(1, Math.max(0, percent / 100))
  return unit * unit
}

/**
 * Quanto a música cede enquanto o narrador fala. O `docs/planejamento.md` fixa
 * a precedência — passo e tiro são informação de gameplay e vêm antes de
 * ambiente e música —, e a fala entra na mesma fila: ela nomeia a medalha que
 * o jogador acabou de ganhar.
 */
export const MUSIC_DUCK_RATIO = 0.35

export function duckedGain(gain: number): number {
  return gain * MUSIC_DUCK_RATIO
}
