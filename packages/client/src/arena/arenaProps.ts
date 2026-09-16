/**
 * Os props do kit de beco espalhados pela arena, em **metros** — a unidade de
 * todo número de gameplay (ADR 0005).
 *
 * **Prop daqui tem colisão**, e é de propósito. A alternativa — decoração que
 * a bala atravessa — é a mentira mais barata de cometer e a mais cara de
 * descobrir: o jogador mira no condensador, vê o rastro passar reto e conclui
 * que o jogo está quebrado. Por isso estes blocos entram no `GREYBOX_BLOCKOUT`
 * como qualquer outro, e daí para `blockoutToStaticBoxes` sem nenhum caminho
 * paralelo: **o que se vê é o que para a bala**, nas duas pontas da rede.
 *
 * O preço disso é a forma: só caixa entra no kit, porque só caixa uma
 * `StaticBox` reproduz sem sobrar. Cano e escada ficaram de fora por isso, não
 * por falta no arquivo de origem.
 *
 * Não importa nada da engine, como o resto de `arena/`.
 */

/** O que `scripts/convert-alley-props.mjs` publica em `props/alley-kit.glb`. */
export type AlleyKitMesh = 'condenser-wide' | 'condenser-narrow'

/**
 * O tamanho de cada peça do kit, como o conversor mede e imprime. É daqui que
 * sai a caixa de colisão, e mexer no kit sem mexer aqui é exatamente a
 * divergência que o teste de `arenaProps` procura.
 */
export const ALLEY_KIT_SIZE_M: Readonly<Record<AlleyKitMesh, readonly [number, number, number]>> = {
  'condenser-wide': [0.951, 0.376, 0.717],
  'condenser-narrow': [0.598, 0.376, 0.717],
}

export interface ArenaProp {
  readonly name: string
  readonly kitMesh: AlleyKitMesh
  /** O centro da peça, que é também o centro da caixa de colisão. */
  readonly centerM: readonly [number, number, number]
  /** Só quarto de volta: ver `propWorldSizeM`. */
  readonly yawRad: number
}

/** Um quarto de volta, o único giro que o kit aceita. */
const QUARTER_TURN_RAD = Math.PI / 2

/**
 * Onde cada condensador fica.
 *
 * Um lugar: **a face dos dois pilares do meio**, a 5,2 m. Ali o prop é
 * alcançável caindo de um deck e vira um degrau de 0,72 m — o que é honesto,
 * porque ele tem caixa de colisão e o jogador pisa exatamente onde vê que dá.
 *
 * **Eram seis lugares, e quatro saíram**: havia um condensador no topo de cada
 * muro, a 22 m, recortado contra a cidade. Aquele muro virou a barreira de
 * contenção translúcida de `greyboxSurfaceSpec.ts`, e condensador de ar
 * apoiado numa malha de contenção que o olho atravessa não tem onde se apoiar.
 * Saíram com o muro, e a colisão deles saiu junto pelo mesmo caminho.
 *
 * **Não** vão em cima das coberturas do chão: elas têm 2,2 m porque o pulo
 * duplo alcança 2,68, e 0,38 m de condensador em cima levaria a 2,58 — dentro
 * do alcance ainda, mas raspando, e o teste do envelope de pulo não olha para
 * a camada de prop. Aquela margem é de level design e não se mexe de lado.
 */
export const ARENA_PROPS: readonly ArenaProp[] = [
  // as quatro faces dos pilares que olham para o centro da arena: é de lá que
  // se atira neles, e é lá que a colisão precisa estar certa.
  {
    name: 'prop-pillar-ne-west',
    kitMesh: 'condenser-narrow',
    centerM: [13.6415, 5.2, 16],
    yawRad: QUARTER_TURN_RAD,
  },
  {
    name: 'prop-pillar-ne-south',
    kitMesh: 'condenser-wide',
    centerM: [16, 5.2, 13.6415],
    yawRad: 0,
  },
  {
    name: 'prop-pillar-sw-east',
    kitMesh: 'condenser-narrow',
    centerM: [-13.6415, 5.2, -16],
    yawRad: QUARTER_TURN_RAD,
  },
  {
    name: 'prop-pillar-sw-north',
    kitMesh: 'condenser-wide',
    centerM: [-16, 5.2, -13.6415],
    yawRad: 0,
  },
]

/**
 * O tamanho do prop **no mundo**, já com o giro aplicado. Um quarto de volta
 * troca a largura pela profundidade, e é por isso que o kit só aceita giro de
 * quarto de volta: com 30° a caixa envolvente cresceria nos dois eixos, e
 * sobraria colisão onde não há prop nenhum — a mentira contrária à do prop sem
 * colisão, e igualmente ruim.
 *
 * ```ts
 * propWorldSizeM('condenser-wide', 0) // [0.951, 0.376, 0.717]
 * ```
 */
export function propWorldSizeM(
  kitMesh: AlleyKitMesh,
  yawRad: number,
): readonly [number, number, number] {
  const [width, height, depth] = ALLEY_KIT_SIZE_M[kitMesh]
  const quarters = yawRad / QUARTER_TURN_RAD
  if (!Number.isInteger(quarters)) {
    throw new RangeError(`yawRad recebeu ${yawRad}; esperado múltiplo de ${QUARTER_TURN_RAD}`)
  }
  return quarters % 2 === 0 ? [width, height, depth] : [depth, height, width]
}
