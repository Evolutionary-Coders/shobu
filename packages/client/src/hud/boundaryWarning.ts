import { ceilTenths } from './tenths.ts'

/**
 * O aviso de fora da área de jogo. Dado puro: quem escreve no dom é o
 * `arenaHud.ts`, e quem pisca é o css — javascript no laço de quadro disputa o
 * quadro com o render (nfr.md).
 *
 * A contagem anda em **décimos**, e é o décimo que decide quando a tela
 * reescreve: dez escritas por segundo enquanto o aviso está no ar, nenhuma
 * fora dele.
 */
export type BoundaryTone = 'off' | 'warning' | 'critical'

/** O que o aviso diz. Uma ordem, e não uma descrição: o jogador tem cinco segundos. */
export const BOUNDARY_WARNING_TITLE = 'VOLTE PARA A ARENA'

/** Os últimos dois segundos: o âmbar vira vermelho e o pisca acelera. */
export const BOUNDARY_CRITICAL_S = 2

/**
 * Os décimos de segundo restantes, arredondados **para cima**, ou `null` quando
 * não há aviso. Para cima pelo mesmo motivo do relógio da partida: o primeiro
 * quadro fora mostra o prazo inteiro, e o `0,0` só aparece quando acabou. A
 * conta em si mora em `tenths.ts`, dividida com a recarga do gancho.
 *
 * ```ts
 * boundaryTenths(4.93) // 50
 * boundaryTenths(null) // null
 * ```
 *
 * @throws RangeError tempo não finito
 */
export function boundaryTenths(remainingS: number | null): number | null {
  if (remainingS === null) return null
  if (!Number.isFinite(remainingS)) {
    throw new RangeError(`remainingS recebeu ${remainingS}; esperado número finito ou null`)
  }
  return ceilTenths(remainingS)
}

/**
 * ```ts
 * boundaryTone(null) // 'off'
 * boundaryTone(15) // 'critical'
 * ```
 */
export function boundaryTone(tenths: number | null): BoundaryTone {
  if (tenths === null) return 'off'
  return tenths <= BOUNDARY_CRITICAL_S * 10 ? 'critical' : 'warning'
}
