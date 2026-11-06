/**
 * As duas chaves de escrita de um material de parede. Estrutural: o teste roda
 * em node, e o `StandardMaterial` do babylon cabe aqui como está.
 */
export interface OccluderSwitches {
  disableColorWrite: boolean
  disableDepthWrite: boolean
}

/**
 * A parede fora dos passes que ela tapa: no passe principal o greybox não
 * desenha nada — a arte da cidade é quem aparece.
 *
 * ```ts
 * hideFromMainPass(wallMaterial) // nem cor nem profundidade
 * ```
 */
export function hideFromMainPass(material: OccluderSwitches): void {
  material.disableColorWrite = true
  material.disableDepthWrite = true
}

/**
 * A parede dentro de um passe que ela tapa (o do halo, o da poça): escreve
 * profundidade **e** cor — preta. Só profundidade tapava o neon desenhado
 * depois dela, e o desenhado antes vazava: a ordem do passe é a de submissão,
 * e no espelho é do fundo para a frente.
 *
 * ```ts
 * writeInOccluderPass(wallMaterial) // pinta preto onde está na frente
 * ```
 */
export function writeInOccluderPass(material: OccluderSwitches): void {
  material.disableColorWrite = false
  material.disableDepthWrite = false
}
