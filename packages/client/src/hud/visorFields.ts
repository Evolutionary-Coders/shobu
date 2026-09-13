import type { WeaponPhase } from '@shobu/core'
import { dottedField } from './dottedField.ts'

/**
 * Os campos de texto do visor, na **mesma espinha tipográfica** do roteiro do
 * boot e do mostrador da transição: rótulo, pontilhado até a coluna fixa,
 * valor. É o que faz o hud de jogo e a tela de entrada parecerem o mesmo
 * aparelho em vez de dois jogos.
 */
export function scoreField(kills: number): string {
  return dottedField('ABATES', kills.toString().padStart(2, '0'))
}

/**
 * ```ts
 * weaponField(5, 'ready') // 'ARMA ......... PRONTA'
 * ```
 */
export function weaponField(loaded: number, phase: WeaponPhase): string {
  return dottedField('ARMA', weaponValue(loaded, phase))
}

function weaponValue(loaded: number, phase: WeaponPhase): string {
  if (phase === 'reloading') return 'RECARREGANDO'
  if (phase === 'cycling' || phase === 'firing') return 'FERROLHO'
  if (loaded === 0) return 'VAZIA'
  return 'PRONTA'
}

/**
 * Os pontos de uma kill, como o visor os mostra.
 *
 * O sinal faz parte da leitura: `+1` é ganho, e o formato já aceita desconto
 * no dia em que houver um.
 *
 * ```ts
 * killPointsField(1) // '+1'
 * ```
 */
export function killPointsField(points: number): string {
  return points >= 0 ? `+${points}` : `${points}`
}
