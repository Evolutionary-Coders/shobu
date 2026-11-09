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

/** O que acontece ao greybox depois que a arte entra. */
export type GreyboxFate = 'keep' | 'hide' | 'dispose'

/**
 * O destino do greybox quando a arte da cidade entra. Com halo, fica na cena:
 * o passe do halo só desenha malha que a câmera do mundo vê. Sem halo (no
 * celular) mas com poça, sai da vista das câmeras e fica só para o espelho —
 * descartá-lo deixava a poça refletir o neon atrás das paredes. Sem nenhum
 * dos dois, sai da gpu (revisão do #16).
 *
 * ```ts
 * greyboxFate(false, true) // 'hide': o celular em QUALIDADE ainda tem poça
 * ```
 */
export function greyboxFate(glowing: boolean, mirrored: boolean): GreyboxFate {
  if (glowing) return 'keep'
  return mirrored ? 'hide' : 'dispose'
}
