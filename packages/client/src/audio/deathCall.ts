/**
 * A morte do jogador, lida como borda entre dois quadros — o mesmo desenho do
 * `matchMarks.ts`. O narrador comenta a queda uma vez, no quadro em que ela
 * acontece, e não a cada quadro em que o jogador continua no chão.
 *
 * Fora da arena não há queda a comentar: voltar ao menu também tira o jogador
 * de jogo, e o narrador não deve chamar isso de morte.
 *
 * ```ts
 * const deaths = createDeathCall()
 * if (deaths.since({ inArena: true, alive: false })) narrator.say('death', DEATH_PRIORITY, nowS)
 * ```
 */
export interface LifeSituation {
  readonly inArena: boolean
  readonly alive: boolean
}

export interface DeathCall {
  since(situation: Readonly<LifeSituation>): boolean
}

/**
 * Acima da medalha comum: a queda do próprio jogador importa mais para ele do
 * que um abate qualquer do quadro anterior. Abaixo dos marcos de partida.
 */
export const DEATH_PRIORITY = 2

export function createDeathCall(): DeathCall {
  const previous = { alive: false }
  return {
    since: (situation) => {
      const died = situation.inArena && previous.alive && !situation.alive
      previous.alive = situation.inArena && situation.alive
      return died
    },
  }
}
