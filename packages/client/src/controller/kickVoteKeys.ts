/**
 * As teclas do voto de expulsão (ADR 0034): F1 é SIM e F2 é NÃO, como no call
 * of duty; Y e N são a reserva onde o navegador não deixa a página ficar com
 * o F1 (a ajuda). Só valem com o voto aberto e o jogador ainda sem votar: fora
 * disso, Y e N ficam livres.
 *
 * ```ts
 * kickBallotForKey('F1') // true
 * kickBallotForKey('KeyW') // undefined
 * ```
 */
export function kickBallotForKey(code: string): boolean | undefined {
  return KICK_BALLOT_KEYS.get(code)
}

const KICK_BALLOT_KEYS: ReadonlyMap<string, boolean> = new Map([
  ['F1', true],
  ['KeyY', true],
  ['F2', false],
  ['KeyN', false],
])
