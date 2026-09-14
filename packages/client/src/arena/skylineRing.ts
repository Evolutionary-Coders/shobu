/**
 * Onde ficam as cópias do quarteirão cyberpunk que cercam a arena, em
 * **metros** — a unidade de todo número de gameplay (ADR 0005).
 *
 * É cenário e **só** cenário: não entra em `blockoutToStaticBoxes`, não vira
 * caixa de colisão e não para bala. O hitscan varre as caixas do blockout
 * (ADR 0003), então nada aqui muda simulação — é a razão de o anel poder ser
 * decidido no cliente sem o servidor saber que ele existe.
 *
 * Não importa nada da engine de propósito, como `greyboxBlockout.ts`:
 * `loadArenaSkyline.ts` traduz isto para o babylon.
 */

export interface SkylinePlacement {
  /** Canto de origem do quarteirão. O chão dele é y = 0, como o piso da arena. */
  readonly positionM: readonly [number, number, number]
  readonly yawRad: number
  readonly scaleFactor: number
}

/**
 * O quarteirão como ele sai de `scripts/convert-skyline.mjs`, que imprime esta
 * medida em `blockSizeM` a cada conversão. Trocar o asset de origem sem
 * atualizar esta linha faz o teste da linha de visão medir o prédio errado.
 */
export const SKYLINE_BLOCK_SIZE_M: readonly [number, number, number] = [9.18, 3.11, 8.83]

/**
 * Em tamanho natural o quarteirão é um diorama, e seria um brinquedo no canto
 * do mapa. Em 60× o prédio mais alto passa de 187 m, que é o que precisa para
 * aparecer **por cima do casco de 22 m**: do olho no centro da arena, a borda
 * do muro esconde tudo abaixo da reta que passa por ela, e nenhuma escala
 * menor que ~40× põe torre acima dessa reta. É o que o teste vigia.
 */
export const SKYLINE_BLOCK_SCALE = 60

/**
 * Raio do anel, medido e não escolhido: é o menor que mantém o quarteirão fora
 * da arena. Com ele a geometria mais próxima acima de 1 m fica a **37,3 m** do
 * centro, e a arena termina em 32,5 — quase 5 m de folga para o muro. Aproximar
 * mais melhora a vista e começa a enfiar prédio dentro do mapa.
 */
export const SKYLINE_RING_RADIUS_M = 133.5

/**
 * Quatro e não oito. Oito dobrariam os 64 mil triângulos por cópia sem fechar
 * vão nenhum: com quatro, a diagonal — que é onde o vão apareceria — já mostra
 * skyline cheia, porque cada cópia é larga o bastante para cobrir o canto da
 * vizinha.
 */
export const SKYLINE_COPIES = 4

/**
 * O vértice mais distante do anel fica a 610 m do centro da arena, e o jogador
 * pode estar a 45 m do centro no canto oposto. Sem esticar o plano distante até
 * aqui, o babylon corta as torres do fundo e abre um buraco no horizonte.
 *
 * É maior que o alcance do hitscan de propósito: o que se vê aqui é cenário
 * fora de alcance, não alvo.
 */
export const SKYLINE_FAR_PLANE_M = 660

/**
 * O material que o `convert-skyline.mjs` marca como letreiro e janela acesa.
 * Quem tem este nome ignora a luz da arena e brilha com a própria cor.
 */
export const SKYLINE_NEON_MATERIAL = 'skyline-neon'

/**
 * As cópias do quarteirão, em anel. Cada uma gira junto com o ângulo em que
 * está: sem esse giro as quatro mostrariam a mesma fachada para dentro, e a
 * repetição salta aos olhos.
 *
 * ```ts
 * skylineRingPlacements()[0] // { positionM: [0, 0, 133.5], yawRad: 0, scaleFactor: 60 }
 * ```
 */
export function skylineRingPlacements(): readonly SkylinePlacement[] {
  return Array.from({ length: SKYLINE_COPIES }, (_unused, copy) => {
    const yawRad = (copy * 2 * Math.PI) / SKYLINE_COPIES
    return {
      positionM: [
        Math.sin(yawRad) * SKYLINE_RING_RADIUS_M,
        0,
        Math.cos(yawRad) * SKYLINE_RING_RADIUS_M,
      ] as const,
      yawRad,
      scaleFactor: SKYLINE_BLOCK_SCALE,
    }
  })
}

/**
 * Se o material carrega neon. A marca é o nome, escrito pelo conversor — é o
 * único canal que sobrevive à viagem pelo glb, porque os dois materiais do
 * arquivo são idênticos em tudo o mais.
 *
 * ```ts
 * isSkylineNeon('skyline-neon') // true
 * ```
 */
export function isSkylineNeon(materialName: string): boolean {
  return materialName.includes(SKYLINE_NEON_MATERIAL)
}
