import { ceilTenths, tenthsLabel } from './tenths.ts'
import { thinBarFraction } from './thinBar.ts'

/**
 * O mostrador do gancho: pronto, ou quanto falta para a recarga acabar.
 *
 * Os segundos vêm do núcleo (`grappleCooldownLeftS`), que conta da soltura:
 * engatado, o mostrador fica cheio e parado na recarga inteira, e começa a
 * descer quando a corda solta. Errar o disparo mostra a recarga curta.
 */
export type GrappleState = 'ready' | 'cooling'

export interface GrappleReadout {
  readonly state: GrappleState
  /** `PRONTO`, ou os segundos restantes com um décimo, como o aviso de fora da área. */
  readonly label: string
  /** O quanto a recarga já andou, de 0 a 1: é a barra, que enche até ficar pronto. */
  readonly charge: number
}

/** O que o mostrador diz com o gancho carregado. */
export const GRAPPLE_READY_LABEL = 'PRONTO'

/**
 * Pronto é o décimo **arredondado** chegar a zero, e não o tempo bruto: senão a
 * tela passaria um quadro dizendo `0,0` com o gancho ainda travado.
 *
 * ```ts
 * grappleReadout(3.14, 5) // { state: 'cooling', label: '3,2', charge: 0.372 }
 * grappleReadout(0, 5)    // { state: 'ready', label: 'PRONTO', charge: 1 }
 * ```
 *
 * @throws RangeError tempo não finito, ou recarga que não é positiva
 */
export function grappleReadout(remainingS: number, cooldownS: number): GrappleReadout {
  const tenths = ceilTenths(remainingS)
  // pronto antes da razão: `grapple.cooldownS` aceita 0 no config, e gancho
  // sem recarga está sempre pronto em vez de dividir por zero.
  if (tenths === 0) return { state: 'ready', label: GRAPPLE_READY_LABEL, charge: 1 }
  const charge = 1 - thinBarFraction(remainingS, cooldownS)
  return { state: 'cooling', label: tenthsLabel(tenths), charge }
}
