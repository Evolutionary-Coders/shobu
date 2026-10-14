/**
 * As predefinições de qualidade, como dado. Mudam **custo por quadro** —
 * resolução, gradação de cor, filtro de textura, sombras de contato, halo dos
 * neons — e nunca a taxa de quadros nem o jogo: colisão, alcance, névoa e a
 * visibilidade de quem está na arena são iguais em todas, senão DESEMPENHO
 * viraria vantagem.
 *
 * O MSAA fica fora da tabela de propósito: ele é decidido na criação do
 * contexto webgl e não muda em tempo real. Fica sempre ligado, e é a escala
 * de resolução que baixa o custo dele junto com o resto (ADR 0014).
 */
export type QualityPreset = 'quality' | 'balanced' | 'performance' | 'auto'

/** A ordem do menu: o valor guardado nas configurações é o índice. */
export const QUALITY_PRESETS: readonly QualityPreset[] = [
  'quality',
  'balanced',
  'performance',
  'auto',
]

export const QUALITY_LABELS: readonly string[] = ['QUALIDADE', 'EQUILIBRADO', 'DESEMPENHO', 'AUTO']

export interface QualityLevel {
  /**
   * Fração da resolução css que o canvas desenha. QUALIDADE usa a resolução
   * nativa (`devicePixelRatio`, com teto), e por isso tem `native`.
   */
  readonly renderScale: number
  readonly native: boolean
  /** A gradação de cor do canvas (`hud.css`). */
  readonly grading: boolean
  readonly anisotropy: number
  readonly contactShadows: boolean
  readonly neonGlow: boolean
  /**
   * O reflexo dos letreiros na poça (`MirrorTexture`): uma segunda passada da
   * cena, só com o neon, a cada quadro. É o enfeite mais caro do mapa noturno,
   * e por isso só existe em QUALIDADE.
   */
  readonly puddleReflections: boolean
}

/** Acima de 2× a tela de um celular passa de 4 vezes os pixels do desktop, e o olho não vê a diferença. */
export const MAX_DEVICE_PIXEL_RATIO = 2

export const QUALITY_LEVELS: Readonly<Record<Exclude<QualityPreset, 'auto'>, QualityLevel>> = {
  quality: {
    renderScale: 1,
    native: true,
    grading: true,
    anisotropy: 8,
    contactShadows: true,
    neonGlow: true,
    puddleReflections: true,
  },
  balanced: {
    renderScale: 1,
    native: false,
    grading: true,
    anisotropy: 4,
    contactShadows: true,
    neonGlow: true,
    puddleReflections: false,
  },
  performance: {
    renderScale: 0.75,
    native: false,
    grading: false,
    anisotropy: 1,
    contactShadows: false,
    neonGlow: false,
    puddleReflections: false,
  },
}

/**
 * ```ts
 * qualityPresetAt(3) // 'auto'
 * ```
 */
export function qualityPresetAt(index: number): QualityPreset {
  return QUALITY_PRESETS[index] ?? 'auto'
}

/**
 * O nível que vale agora. O AUTO é EQUILIBRADO com a escala que a política
 * dele escolheu (`autoQuality.ts`).
 *
 * ```ts
 * qualityLevelFor('auto', 0.8).renderScale // 0.8
 * ```
 */
export function qualityLevelFor(preset: QualityPreset, autoScale: number): QualityLevel {
  if (preset !== 'auto') return QUALITY_LEVELS[preset]
  return { ...QUALITY_LEVELS.balanced, renderScale: autoScale }
}

/**
 * Quantos pixels de tela por pixel css o canvas desenha.
 *
 * ```ts
 * pixelRatioFor(QUALITY_LEVELS.quality, 3) // 2
 * ```
 */
export function pixelRatioFor(level: QualityLevel, devicePixelRatio: number): number {
  if (!level.native) return level.renderScale
  return Math.min(MAX_DEVICE_PIXEL_RATIO, Math.max(1, devicePixelRatio))
}
