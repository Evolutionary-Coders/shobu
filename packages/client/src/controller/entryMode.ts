/**
 * Como o jogador entra na arena: com o ponteiro travado (desktop) ou com o
 * celular no óculos (ADR 0012).
 */
export type EntryMode = 'pointer-lock' | 'headset'

/** O que o navegador diz de si. Estrutural, para o teste não precisar de dom. */
export interface EntryEnvironment {
  /** `matchMedia('(pointer: coarse)')`: o dedo, e não o mouse, é o ponteiro. */
  readonly coarsePointer: boolean
  /** Existe `DeviceOrientationEvent`: há giroscópio para a cabeça. */
  readonly hasOrientationSensor: boolean
  /** `location.search`. */
  readonly query: string
}

/**
 * Celular com giroscópio entra no óculos; todo o resto, no ponteiro travado.
 *
 * `?vr=1` força o óculos (para ver o estéreo no desktop, com o mouse olhando) e
 * `?vr=0` força o desktop (para jogar no celular sem o óculos, na mesa).
 *
 * ```ts
 * entryModeFor({ coarsePointer: true, hasOrientationSensor: true, query: '' }) // 'headset'
 * entryModeFor({ coarsePointer: false, hasOrientationSensor: false, query: '?vr=1' }) // 'headset'
 * ```
 */
export function entryModeFor(environment: EntryEnvironment): EntryMode {
  const forced = new URLSearchParams(environment.query).get('vr')
  if (forced === '1') return 'headset'
  if (forced === '0') return 'pointer-lock'
  const handheld = environment.coarsePointer && environment.hasOrientationSensor
  return handheld ? 'headset' : 'pointer-lock'
}
