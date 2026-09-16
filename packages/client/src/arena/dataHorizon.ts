/**
 * O que existe **fora** da arena: uma grade que segue até o horizonte e poucas
 * torres de dados, em metros (ADR 0005).
 *
 * Substitui a cidade cyberpunk de `skylineRing.ts`, apagada pela
 * [ADR 0009](../../../../docs/adr/0009-a-arena-e-ciberespaco-nao-cidade.md). O
 * quarteirão do sketchfab era um diorama de 9,18 × 3,11 × 8,83 m — mais largo
 * que alto —, e esticado para virar horizonte nunca fechava a conta: as cópias
 * se interpenetravam, a quina de uma delas entrava na arena, e o conjunto
 * custava 1,2 milhão de triângulos por quadro e 2,9 MB de download.
 *
 * O que entra no lugar custa **zero byte** e dois punhados de draw calls,
 * porque é geometria de caixa e textura gerada. E resolve o que a cidade não
 * resolvia: um fundo **calmo** — nada animado, nada saturado, nada na
 * frequência espacial de um alvo a 90 m.
 *
 * É cenário e **só** cenário: não entra em `blockoutToStaticBoxes`, não tem
 * colisão e não para bala.
 */

export type Rgb = readonly [number, number, number]

/**
 * O chão do não-espaço, um plano quadrado centrado na arena. Grande o bastante
 * para o olho nunca alcançar a borda dele através da névoa — a
 * transmitância de `arenaFogSpec.ts` já está em 0,4% a 1000 m.
 */
export const GRID_PLANE_SIDE_M = 2400

/**
 * Meio centímetro abaixo do piso da arena. O piso fica em y = 0 e os dois
 * planos se tocam: sem o afundamento eles brigam pelo mesmo pixel e a arena
 * inteira cintila.
 */
export const GRID_PLANE_Y_M = -0.02

/**
 * O lado da célula, em metros. **É o dispositivo de escala do mapa**: um
 * jogador de 2 m cobre duas células, e convergência de perspectiva com
 * espaçamento conhecido é como o olho mede distância num vazio. Era isso que
 * os prédios davam, e é isto que os substitui.
 */
export const GRID_CELL_M = 1

/** A cada oito células, uma linha mais forte — hierarquia, não xadrez. */
export const GRID_MAJOR_EVERY = 8

export interface DataTower {
  readonly name: string
  readonly centerM: readonly [number, number, number]
  readonly sizeM: readonly [number, number, number]
}

/**
 * Dois raios, e poucas torres em cada. Dois e não um porque **paralaxe precisa
 * de dois planos**: andar pela arena tem que mover o de perto mais que o de
 * longe, e foi a falta disso que fez o anel único de antes ler como muro
 * pintado.
 *
 * Poucas, e não muitas, porque a névoa come quase tudo àquela distância e
 * torre que não se distingue é triângulo pago à toa. São "luzes de cidade
 * recuando", não uma cidade.
 */
const TOWER_RINGS: readonly { readonly radiusM: number; readonly count: number }[] = [
  { radiusM: 260, count: 5 },
  { radiusM: 610, count: 4 },
]

/** O piso e o teto da altura das torres. A variação é o que evita a fileira de dentes. */
const TOWER_HEIGHT_RANGE_M: readonly [number, number] = [150, 400]
const TOWER_SIDE_RANGE_M: readonly [number, number] = [12, 30]

/**
 * O vértice mais distante de qualquer torre, medido e não escrito à mão. É o
 * que o plano distante da câmera tem que alcançar.
 */
export function dataHorizonReachM(): number {
  return Math.max(...TOWER_RINGS.map(({ radiusM }) => radiusM)) + TOWER_SIDE_RANGE_M[1]
}

/**
 * O jogador pode estar a esta distância do centro olhando para o horizonte
 * oposto — a quina do piso de 64 m.
 */
const FURTHEST_EYE_FROM_CENTRE_M = Math.hypot(32, 32)

/**
 * Sem esticar o plano distante até aqui, o babylon corta a torre do fundo e
 * abre um buraco no horizonte. É maior que o alcance do hitscan de propósito:
 * o que se vê aqui é cenário fora de alcance, não alvo.
 */
export const DATA_HORIZON_FAR_PLANE_M = Math.ceil(
  (dataHorizonReachM() + FURTHEST_EYE_FROM_CENTRE_M) * 1.05,
)

/**
 * As torres, com a base assentada no chão do não-espaço.
 *
 * ```ts
 * dataTowers()[0].sizeM[1] // entre 150 e 400
 * ```
 */
export function dataTowers(): readonly DataTower[] {
  return TOWER_RINGS.flatMap((ring, ringIndex) =>
    Array.from({ length: ring.count }, (_unused, tower) => raise(ring, ringIndex, tower)),
  )
}

function raise(
  ring: { readonly radiusM: number; readonly count: number },
  ringIndex: number,
  tower: number,
): DataTower {
  // o `+ ringIndex * 0.41` desencontra os dois anéis: alinhados, a torre de
  // perto taparia a de longe e a paralaxe não teria o que mostrar.
  const angleRad = ((tower + ringIndex * 0.41) * 2 * Math.PI) / ring.count
  const heightM = span(TOWER_HEIGHT_RANGE_M, jitter(ringIndex, tower, 1))
  const sideM = span(TOWER_SIDE_RANGE_M, jitter(ringIndex, tower, 2))
  const radiusM = ring.radiusM * (1 + 0.12 * (jitter(ringIndex, tower, 3) * 2 - 1))
  return {
    name: `data-tower-${ringIndex}-${tower}`,
    centerM: [Math.sin(angleRad) * radiusM, heightM / 2, Math.cos(angleRad) * radiusM],
    sizeM: [sideM, heightM, sideM],
  }
}

function span([low, high]: readonly [number, number], unit: number): number {
  return low + (high - low) * unit
}

/**
 * Desvio determinístico em [0, 1), do hash clássico de shader. A mesma cidade
 * em toda máquina e em todo teste — captura de tela que muda sozinha entre dois
 * runs não compara nada.
 */
function jitter(ringIndex: number, tower: number, channel: number): number {
  const hash = Math.sin(ringIndex * 127.1 + tower * 311.7 + channel * 74.7) * 43758.5453
  return hash - Math.floor(hash)
}
