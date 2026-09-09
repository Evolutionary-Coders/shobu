/**
 * Onde o avatar do competidor apoia o pé e em que escala ele entra, em
 * **metros** — a unidade de todo número de gameplay (ADR 0005).
 *
 * Não importa nada da engine de propósito: o mesmo cálculo alimenta o renderer
 * hoje e a interpolação do estado remoto depois (ADR 0002).
 */

/**
 * Altura medida do glTF em `public/assets/character/competitor.glb`, com a
 * escala 100 do nó `CharacterArmature` já aplicada. Medida lendo o json do
 * glTF, não a descrição da página de origem — ver `docs/asset-licenses.md`.
 */
export const COMPETITOR_MODEL_HEIGHT_M = 1.854

/**
 * O clipe que roda enquanto ninguém liga o controlador. O nome vem do glb, com
 * o prefixo da armature que o `FBX2glTF` deixou: trocar o asset sem trocar
 * esta string quebra o avatar em T-pose, que é o defeito clássico.
 */
export const COMPETITOR_IDLE_CLIP = 'CharacterArmature|Idle_Gun' as const

/**
 * O modelo tem 1,854 m e a cápsula de colisão tem 1,8: a razão é o botão de
 * calibração que faz a silhueta do inimigo bater com a caixa que o servidor
 * testa. Silhueta maior que o hitbox é tiro que acerta na tela e não conta.
 *
 * ```ts
 * mesh.scaling.setAll(competitorAvatarScale(config.collision.capsuleHeightM))
 * ```
 */
export function competitorAvatarScale(capsuleHeightM: number): number {
  if (!(capsuleHeightM > 0)) {
    throw new RangeError(`capsuleHeightM recebeu ${capsuleHeightM}; esperado altura em metros > 0`)
  }
  return capsuleHeightM / COMPETITOR_MODEL_HEIGHT_M
}

/**
 * Todo ponto de `GREYBOX_SPAWN_POINTS_M` está **uma altura de cápsula acima da
 * superfície que o sustenta** — 1,8 sobre o piso que termina em y 0, e 9,3
 * sobre o deck que termina em 7,5. A malha do glTF tem origem no pé, então
 * descer uma cápsula é o que apoia o avatar no chão em vez de pendurá-lo.
 *
 * ```ts
 * competitorFeetM([26, 1.8, 26], 1.8) // → [26, 0, 26]
 * ```
 */
export function competitorFeetM(
  eyeM: readonly [number, number, number],
  capsuleHeightM: number,
): readonly [number, number, number] {
  return [eyeM[0], eyeM[1] - capsuleHeightM, eyeM[2]]
}
