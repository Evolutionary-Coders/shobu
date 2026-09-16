/**
 * Onde ficam as cópias do quarteirão cyberpunk que cercam a arena, em
 * **metros** — a unidade de todo número de gameplay (ADR 0005).
 *
 * É cenário e **só** cenário: não entra em `blockoutToStaticBoxes`, não vira
 * caixa de colisão e não para bala. O hitscan varre as caixas do blockout
 * (ADR 0003), então nada aqui muda simulação — é a razão de os anéis poderem
 * ser decididos no cliente sem o servidor saber que eles existem.
 *
 * Não importa nada da engine de propósito, como `greyboxBlockout.ts`:
 * `loadArenaSkyline.ts` traduz isto para o babylon.
 */

export interface SkylinePlacement {
  /** O centro do quarteirão em x e z; em y, a **base** dele assenta no chão. */
  readonly positionM: readonly [number, number, number]
  readonly yawRad: number
  readonly scaleFactor: number
}

export interface SkylineRing {
  readonly name: string
  readonly radiusM: number
  readonly scaleFactor: number
  readonly copies: number
}

/**
 * O quarteirão como ele sai de `scripts/convert-skyline.mjs`, que imprime esta
 * medida em `blockSizeM` a cada conversão. Trocar o asset de origem sem
 * atualizar esta linha faz o teste da linha de visão medir o prédio errado.
 */
export const SKYLINE_BLOCK_SIZE_M: readonly [number, number, number] = [9.18, 3.11, 8.83]

/**
 * **Três anéis, e não um.** O anel único era um anteparo de teatro: quatro
 * cópias do mesmo quarteirão, no mesmo raio, mostrando a mesma fachada para
 * dentro. Sem nada mais perto nem mais longe, a cidade não tinha profundidade
 * — era um muro pintado, e o jogador lia isso na primeira vez que andava.
 *
 * O que faz um fundo ler como cidade é **paralaxe**: andar pela arena tem que
 * mover o que está perto mais que o que está longe. Isso precisa de camadas,
 * não de mais cópias na mesma camada.
 *
 * E a escala cai onde mais se vê. O anel único estava em **60×** sobre um
 * diorama de 9 m — densidade de vértice esticada sessenta vezes, que de perto
 * é faceta gigante e lisa. O anel de perto agora está em 14×, com **quatro
 * vezes mais vértice por metro** de fachada. Foi isso, e não a distância, que
 * fazia a cidade parecer de papelão.
 */
export const SKYLINE_RINGS: readonly SkylineRing[] = [
  { name: 'near', radiusM: 185, scaleFactor: 18, copies: 8 },
  { name: 'mid', radiusM: 350, scaleFactor: 32, copies: 6 },
  { name: 'far', radiusM: 520, scaleFactor: 46, copies: 6 },
]

/**
 * O quanto cada cópia foge da grade: giro, escala e raio. A simetria perfeita
 * era o outro defeito do anel único — as quatro cópias tinham `yaw` igual ao
 * ângulo em que estavam, então todas mostravam a **mesma fachada** para dentro
 * e a repetição saltava aos olhos.
 *
 * Determinístico, e não sorteado: a mesma captura de tela tem que sair igual
 * duas vezes, e um `Math.random` aqui tornaria impossível comparar antes e
 * depois de qualquer ajuste de arte.
 *
 * Modesto de propósito. O desvio **soma** ao raio do anel e ao alcance da
 * cópia, e é o pior caso das duas somas que decide se um prédio entra na
 * arena — que foi exatamente o defeito visto em tela, prédio atravessando a
 * barreira. Jitter grande obrigaria anéis muito mais longe para nada.
 */
const YAW_JITTER_RAD = 0.5
const SCALE_JITTER = 0.1
const RADIUS_JITTER = 0.05

/** A cor do concreto e do vidro da cidade. Escura: é noite, e quem acende é o neon. */
export const SKYLINE_STRUCTURE_RGB: readonly [number, number, number] = [0.26, 0.29, 0.4]

/**
 * O material que o `convert-skyline.mjs` marca como letreiro e janela acesa.
 * Quem tem este nome ignora a luz da arena e brilha com a própria cor.
 */
export const SKYLINE_NEON_MATERIAL = 'skyline-neon'

/** O piso da piscada do letreiro. Acima de zero: neon que apaga de vez é neon quebrado. */
export const NEON_FLICKER_MIN = 0.72

/**
 * Metade da diagonal da pegada de uma cópia, que é o quanto ela se estende do
 * próprio centro no pior sentido. É a medida que decide se um anel entra na
 * arena e até onde o plano distante precisa ir.
 *
 * ```ts
 * copyReachM(14) // 89.2
 * ```
 */
export function copyReachM(scaleFactor: number): number {
  const [width, , depth] = SKYLINE_BLOCK_SIZE_M
  return (Math.hypot(width, depth) * scaleFactor) / 2
}

/**
 * O vértice mais distante do centro da arena, somando o raio esticado pelo
 * jitter e o alcance da cópia. **Medido, não escrito à mão**: era um 610
 * comentado que ninguém recalculava, e mexer numa escala o deixava errado sem
 * nenhum teste notar.
 */
export function skylineFarthestVertexM(): number {
  return Math.max(
    ...SKYLINE_RINGS.map(
      (ring) => ring.radiusM * (1 + RADIUS_JITTER) + copyReachM(ring.scaleFactor),
    ),
  )
}

/**
 * O jogador pode estar a esta distância do centro quando olha para o horizonte
 * oposto — a quina do piso de 64 m. Entra na conta do plano distante porque é
 * de lá que a torre mais longe tem que continuar desenhando.
 */
const FURTHEST_EYE_FROM_CENTRE_M = Math.hypot(32, 32)

/**
 * Sem esticar o plano distante até aqui, o babylon corta as torres do fundo e
 * abre um buraco no horizonte.
 *
 * É maior que o alcance do hitscan de propósito: o que se vê aqui é cenário
 * fora de alcance, não alvo.
 */
export const SKYLINE_FAR_PLANE_M = Math.ceil(
  (skylineFarthestVertexM() + FURTHEST_EYE_FROM_CENTRE_M) * 1.05,
)

/**
 * As cópias de todos os anéis, prontas para virar instância.
 *
 * ```ts
 * skylineRingPlacements()[0].positionM[1] // a base assenta em y = 0
 * ```
 */
export function skylineRingPlacements(): readonly SkylinePlacement[] {
  return SKYLINE_RINGS.flatMap((ring, ringIndex) =>
    Array.from({ length: ring.copies }, (_unused, copy) => placeCopy(ring, ringIndex, copy)),
  )
}

/**
 * Uma cópia. O `+ ringIndex` na fase é o que impede os vãos de um anel de
 * ficarem alinhados com os do anel de trás: sem ele, os três anéis abririam a
 * mesma fresta no mesmo ângulo e dariam para ver o céu através da cidade toda.
 *
 * A base assenta em y = 0 porque o glb é **centrado nos três eixos**: sem o
 * levante, metade de cada prédio fica enterrada abaixo do piso da arena, e é
 * por isso que a cidade antiga parecia um muro de lajes e não um horizonte.
 */
function placeCopy(ring: SkylineRing, ringIndex: number, copy: number): SkylinePlacement {
  const angleRad = ((copy + ringIndex * 0.37) * 2 * Math.PI) / ring.copies
  const scaleFactor = ring.scaleFactor * (1 + SCALE_JITTER * jitter(ringIndex, copy, 1))
  const radiusM = ring.radiusM * (1 + RADIUS_JITTER * jitter(ringIndex, copy, 2))
  return {
    positionM: [
      Math.sin(angleRad) * radiusM,
      (SKYLINE_BLOCK_SIZE_M[1] * scaleFactor) / 2,
      Math.cos(angleRad) * radiusM,
    ],
    // o giro acompanha o ângulo — senão toda cópia mostra a mesma fachada para
    // fora em vez de para dentro — mais o desvio que quebra a repetição.
    yawRad: angleRad + YAW_JITTER_RAD * jitter(ringIndex, copy, 3),
    scaleFactor,
  }
}

/**
 * Desvio determinístico em [-1, 1), do hash clássico de shader. Sem estado e
 * sem semente: a mesma cidade em toda máquina e em todo teste.
 */
function jitter(ringIndex: number, copy: number, channel: number): number {
  const hash = Math.sin(ringIndex * 127.1 + copy * 311.7 + channel * 74.7) * 43758.5453
  return (hash - Math.floor(hash)) * 2 - 1
}

/**
 * A piscada do letreiro em `elapsedS`, entre `NEON_FLICKER_MIN` e 1. O
 * [GDD](../../../../docs/gdd.md) pede em "Environment Animations: piscada de
 * neon e de letreiro", e é o que tira a cidade de morta: fundo parado lê como
 * pintura por mais bonito que esteja.
 *
 * Duas senoides de períodos que não fecham juntos, para o padrão não se
 * repetir num ciclo curto e o olho não pegar a volta.
 *
 * ```ts
 * neonFlickerAt(0) // 1
 * ```
 */
export function neonFlickerAt(elapsedS: number): number {
  const wave = 0.5 + 0.5 * (Math.cos(elapsedS * 1.7) * 0.6 + Math.cos(elapsedS * 5.3) * 0.4)
  return NEON_FLICKER_MIN + (1 - NEON_FLICKER_MIN) * wave
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
