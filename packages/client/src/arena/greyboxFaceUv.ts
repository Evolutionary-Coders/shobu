/**
 * O UV de cada face de um bloco do blockout, para a textura ladrilhar no mesmo
 * tamanho **em metros** em toda superfície da arena.
 *
 * Sem isto, a caixa do babylon nasce com uv de 0 a 1 por face, e uma textura
 * de ladrilho cobriria o piso de 64 m e a cobertura de 8 m com um ladrilho só
 * cada: o concreto do chão ficaria oito vezes maior que o da cobertura ao lado.
 * O uv é a única saída porque **os quatro materiais são compartilhados** — o
 * `uScale` do material vale para todos os blocos da camada de uma vez, e são
 * blocos de tamanhos muito diferentes.
 *
 * Não importa nada da engine de propósito, como o resto de `arena/`:
 * `buildGreyboxArena.ts` converte estas tuplas em `Vector4`.
 */

/** `(u0, v0, u1, v1)`, a forma que o `faceUV` do babylon pede. */
export type FaceUv = readonly [number, number, number, number]

/**
 * A ordem das faces de `CreateBox`: frente, trás, direita, esquerda, topo,
 * base. Cada par diz quais duas dimensões do bloco correm no u e no v daquela
 * face — é o que impede o concreto de nascer esticado na vertical num muro
 * alto e fino.
 */
const FACE_AXES: readonly (readonly [0 | 1 | 2, 0 | 1 | 2])[] = [
  [0, 1],
  [0, 1],
  [2, 1],
  [2, 1],
  [0, 2],
  [0, 2],
]

/**
 * ```ts
 * // um muro de 64 × 22 × 1 m, com ladrilho de 4 m
 * faceUvForBox([64, 22, 1], 4)[0] // [0, 0, 16, 5.5]
 * ```
 */
export function faceUvForBox(
  sizeM: readonly [number, number, number],
  metresPerTile: number,
): readonly FaceUv[] {
  if (metresPerTile <= 0) {
    throw new RangeError(`metresPerTile recebeu ${metresPerTile}; esperado número > 0`)
  }
  if (sizeM.some((side) => side <= 0)) {
    throw new RangeError(`sizeM recebeu [${sizeM.join(', ')}]; esperado três lados > 0`)
  }
  return FACE_AXES.map(([uAxis, vAxis]) => [
    0,
    0,
    sizeM[uAxis] / metresPerTile,
    sizeM[vAxis] / metresPerTile,
  ])
}
