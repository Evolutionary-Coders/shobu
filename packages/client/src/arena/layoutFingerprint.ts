import { fnv1a32 } from '@shobu/core'
import type { GreyboxBlock } from './arenaBlock.ts'

/**
 * Uma impressão digital curta do layout: FNV-1a de 32 bits sobre nome, tipo,
 * zona, centro e tamanho de cada bloco, em ordem.
 *
 * Existe para amarrar a arte à colisão (ADR 0010). O build do blender grava
 * esta impressão no manifesto do glb; o teste e o cliente recalculam sobre o
 * layout de agora. Se as duas divergirem, alguém mexeu numa caixa e não
 * refez a arte — e a malha que o jogador vê não é mais a que a bala encontra.
 *
 * Não é criptografia: é detecção de esquecimento, e para isso 32 bits sobram.
 *
 * ```ts
 * layoutFingerprint(ICHIBAN_GAI_BLOCKOUT) // '3f2a9c11'
 * ```
 */
export function layoutFingerprint(blockout: readonly GreyboxBlock[]): string {
  return fnv1a32(canonicalText(blockout)).toString(16).padStart(8, '0')
}

/**
 * O texto que entra no hash. Números com três casas: é a precisão com que se
 * desenha a arena, e protege a impressão de ruído de ponto flutuante entre o
 * node e o navegador.
 */
function canonicalText(blockout: readonly GreyboxBlock[]): string {
  return blockout
    .map((block) =>
      [
        block.name,
        block.layer,
        block.zone,
        ...block.centerM.map(fixed),
        ...block.sizeM.map(fixed),
      ].join('|'),
    )
    .join('\n')
}

function fixed(value: number): string {
  return (Object.is(value, -0) ? 0 : value).toFixed(3)
}
