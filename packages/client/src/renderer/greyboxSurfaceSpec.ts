import type { ArenaLayer } from '../arena/greyboxBlockout.ts'

/**
 * A superfície de cada camada da arena, como dado — a mesma divisão que
 * `arenaLightingSpec.ts` faz com a luz: aqui ficam os números, e
 * `greyboxMaterials.ts` traduz para o babylon.
 *
 * As quatro camadas existem para a **verticalidade ser legível**, e era só a
 * cor que carregava isso enquanto a arena era caixa lisa. Textura diferente por
 * camada diz a mesma coisa por outro canal: concreto embaixo, chapa em cima.
 */

export type Rgb = readonly [number, number, number]

/**
 * Toda camada **menos** `prop`. Prop não é caixa do blockout desenhada pelo
 * `buildGreyboxArena`: ele tem malha própria em `props/alley-kit.glb`, com a
 * textura que veio junto. A caixa dele existe só para a colisão.
 */
export type GreyboxSurfaceLayer = Exclude<ArenaLayer, 'prop'>

export interface GreyboxSurface {
  /** Servido de `public/`, convertido por `npm run convert:arena-textures`. */
  readonly textureUrl: string
  /**
   * Quantos metros de mundo um ladrilho da textura cobre. É o que mantém o
   * concreto do mesmo tamanho no piso de 64 m e na cobertura de 8 m — sem
   * isto, a mesma textura esticaria oito vezes mais num que no outro.
   */
  readonly metresPerTile: number
  /**
   * Multiplica a textura. **Não** é a cor da superfície: é o tom que separa uma
   * camada da vizinha, e por isso todos são claros.
   *
   * Eram 0,3 a 0,78 quando não havia textura e a cor era tudo que havia. Com
   * textura por baixo aqueles números escureciam duas vezes — a textura já tem
   * valor próprio —, e o piso voltava a engolir a luz como antes de 0,3.
   */
  readonly tintRgb: Rgb
}

/**
 * ```ts
 * greyboxSurfaceSpec().shell.textureUrl // '/assets/textures/concrete-panel.webp'
 * ```
 */
export function greyboxSurfaceSpec(): Readonly<Record<GreyboxSurfaceLayer, GreyboxSurface>> {
  return {
    // o casco é piso e muro: a superfície para onde a câmera olha metade do
    // tempo, e a que mais se repete. Ladrilho grande, para a emenda do painel
    // de concreto não virar xadrez num piso de 64 m.
    shell: {
      textureUrl: '/assets/textures/concrete-panel.webp',
      metresPerTile: 4,
      tintRgb: [0.62, 0.62, 0.74],
    },
    ground: {
      textureUrl: '/assets/textures/concrete-slab.webp',
      metresPerTile: 2,
      tintRgb: [0.78, 0.78, 0.86],
    },
    // metal enferrujado e tom quente: é o contraste de temperatura contra o
    // concreto frio das duas camadas de baixo que faz o deck saltar.
    mid: {
      textureUrl: '/assets/textures/metal-rusted.webp',
      metresPerTile: 2,
      tintRgb: [1, 0.86, 0.68],
    },
    top: {
      textureUrl: '/assets/textures/metal-plate.webp',
      metresPerTile: 2,
      tintRgb: [1, 0.82, 0.48],
    },
  }
}
