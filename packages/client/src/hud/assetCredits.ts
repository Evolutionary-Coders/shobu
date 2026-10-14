/**
 * Os créditos de asset que a tela de boot mostra em CRÉDITOS, no rodapé.
 *
 * A única atribuição **exigida** é a do "sniper animated" (DJMaesen, CC-BY-4.0):
 * os braços dele estão na sniper, na katana e na faca em primeira pessoa, e a
 * CC-BY pede o crédito onde o jogo é publicado (`docs/asset-licenses.md`). O
 * resto (CC0, OFL, Apache-2.0, FontStruct) não exige crédito na tela, e entra
 * como cortesia.
 *
 * `bootOverlay.ts` escreve a lista no rodapé; o teste confere que a linha
 * exigida, o glb e o documento de licenças dizem a mesma coisa.
 */

/** A atribuição que o glb carrega em `asset.extras`, nos campos do Sketchfab. */
export interface GlbAttribution {
  readonly title: string
  readonly source: string
  readonly author: string
  readonly license: string
}

export interface AssetCredit {
  readonly line: string
  /** CC-BY exige a linha; CC0 e OFL não, e ela é cortesia. */
  readonly required: boolean
}

export const SNIPER_ARMS_ATTRIBUTION: GlbAttribution = {
  title: 'sniper animated',
  source: 'https://sketchfab.com/3d-models/sniper-animated-eae1ba5b43ae4bc89b0647fb5d8a2d27',
  author: 'DJMaesen (https://sketchfab.com/bumstrum)',
  license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
}

/** Os glb, relativos a `public/assets/`, feitos sobre os braços do "sniper animated". */
export const SNIPER_ARMS_GLBS: readonly string[] = [
  'viewmodel/sniper.glb',
  'viewmodel/katana.glb',
  'viewmodel/knife.glb',
]

/**
 * A linha de crédito da CC-BY, na forma que o Sketchfab pede.
 *
 * ```ts
 * ccByLine(SNIPER_ARMS_ATTRIBUTION) // 'This work is based on "sniper animated" (https://…'
 * ```
 */
export function ccByLine(attribution: GlbAttribution): string {
  return `This work is based on "${attribution.title}" (${attribution.source}) by ${attribution.author} licensed under ${attribution.license}`
}

export const ASSET_CREDITS: readonly AssetCredit[] = [
  { line: ccByLine(SNIPER_ARMS_ATTRIBUTION), required: true },
  {
    line: 'Personagens e animações: Quaternius (https://quaternius.com), CC0 1.0',
    required: false,
  },
  { line: 'Texturas e objetos: Poly Haven (https://polyhaven.com), CC0 1.0', required: false },
  { line: 'Carros: Car Kit, Kenney (https://kenney.nl), CC0 1.0', required: false },
  {
    line: 'Fontes: Departure Mono (Helena Zhang), Rajdhani (Indian Type Foundry), Noto Sans e Noto Serif CJK JP (Google, Adobe), SIL OFL 1.1',
    required: false,
  },
  { line: 'Números do hud: MG Rising (Lunners, FontStruct)', required: false },
  { line: 'Voz do narrador: Kokoro-82M (hexgrad), Apache-2.0', required: false },
]
