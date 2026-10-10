/**
 * Até quando o boot espera a arte. A entrada espera o download inteiro — é o
 * que impede o jogador de cair no greybox e ver a cidade pipocar —, mas sem
 * prazo um download parado prendia o jogador na barra para sempre, e na feira,
 * com vários celulares no mesmo wi-fi, isso acontece (revisão do PR #16). A
 * arena joga com o greybox desde o primeiro quadro: esperar é estética, não
 * requisito.
 *
 * Dois prazos, e o primeiro que vencer solta a entrada:
 * - **parado**: a barra não anda há `LOAD_STALL_S`. Wi-fi lento mas andando
 *   continua esperando a arte;
 * - **teto**: `LOAD_CEILING_S` desde o começo, ande a barra ou não.
 */
export const LOAD_STALL_S = 8
export const LOAD_CEILING_S = 25

export interface LoadDeadline {
  /** A barra agora; devolve se a espera venceu. */
  expired(ratio: number, nowS: number): boolean
}

/**
 * ```ts
 * const deadline = createLoadDeadline(performance.now() / 1000)
 * if (deadline.expired(progress.ratio(), performance.now() / 1000)) openTheGate()
 * ```
 */
export function createLoadDeadline(startS: number): LoadDeadline {
  const last = { ratio: 0, changedS: startS }
  return {
    expired: (ratio, nowS) => {
      if (ratio > last.ratio) {
        last.ratio = ratio
        last.changedS = nowS
      }
      return nowS - last.changedS >= LOAD_STALL_S || nowS - startS >= LOAD_CEILING_S
    },
  }
}
