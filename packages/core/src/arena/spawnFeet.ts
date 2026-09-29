/**
 * Todo ponto de `GREYBOX_SPAWN_POINTS_M` está **uma altura de cápsula acima da
 * superfície que o sustenta** — 1,8 sobre o piso que termina em y 0, e 9,3
 * sobre o deck que termina em 7,5. Descer uma cápsula dá o pé: é onde o
 * servidor põe o personagem e onde o cliente apoia o avatar, que tem a origem
 * no pé.
 *
 * ```ts
 * spawnFeetM([26, 2, 26], 2) // → [26, 0, 26]
 * ```
 */
export function spawnFeetM(
  eyeM: readonly [number, number, number],
  capsuleHeightM: number,
): readonly [number, number, number] {
  return [eyeM[0], eyeM[1] - capsuleHeightM, eyeM[2]]
}
