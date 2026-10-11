import type { WeaponPhase } from '@shobu/core'

/**
 * As marcas de bala do visor: uma por bala do pente, acesa ou apagada. É
 * leitura de relance — contar cinco marcas é mais rápido que ler um número, e
 * num sniper de ferrolho o que importa é "tenho mais?".
 */
export type PipState = 'loaded' | 'chambered' | 'spent'

/**
 * O tamanho do pente vem da configuração, não daqui: `weapon.magazineRounds` é
 * a fonte da verdade (ADR 0005), e o hud desenha o que ela disser.
 *
 * ```ts
 * ammoPipStates(3, 5, 'ready') // ['loaded', 'loaded', 'loaded', 'spent', 'spent']
 * ```
 */
export function ammoPipStates(
  loaded: number,
  magazineRounds: number,
  phase: WeaponPhase,
): readonly PipState[] {
  if (!Number.isInteger(magazineRounds) || magazineRounds < 1) {
    throw new RangeError(`magazineRounds recebeu ${magazineRounds}; esperado inteiro >= 1`)
  }
  if (!Number.isInteger(loaded) || loaded < 0 || loaded > magazineRounds) {
    throw new RangeError(`loaded recebeu ${loaded}; esperado inteiro de 0 a ${magazineRounds}`)
  }
  return Array.from({ length: magazineRounds }, (_, index) => pipAt(index, loaded, phase))
}

/**
 * A bala na câmara é a primeira acesa, e só enquanto o ferrolho cicla: é o que
 * mostra ao jogador que a arma ainda não está pronta, sem texto nenhum.
 */
function pipAt(index: number, loaded: number, phase: WeaponPhase): PipState {
  if (index >= loaded) return 'spent'
  if (index === 0 && phase === 'cycling') return 'chambered'
  return 'loaded'
}
