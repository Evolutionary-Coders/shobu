import { PRIMARY_WEAPONS, type PrimaryWeapon } from '@shobu/core'

/**
 * As regras de download dos modelos de arma principal, as mesmas em primeira
 * pessoa (`loadSniperViewmodel.ts`) e nos rifles de terceira
 * (`driveBotAvatars.ts`): quais já chegaram, quais estão vindo, e quando uma
 * que falhou pode ser pedida de novo. Os adapters só baixam o que isto manda.
 *
 * Duas regras nasceram de uma falha só (revisão da integração da laser, 29/10):
 * com o glb da laser fora do ar, nada caía para a clássica, e a mão ficava
 * vazia para sempre — a primeira pessoa só tentava de novo na próxima troca de
 * classe, e os rifles nunca.
 *
 * - **queda para a outra**: quem quer uma arma que falhou e ainda não chegou
 *   pede também as outras, e `shownPrimary` põe na mão a que chegar.
 * - **nova tentativa com teto**: a que falhou volta a ser pedida depois de
 *   `RETRY_AFTER_S`, no máximo `MAX_LOAD_ATTEMPTS` vezes. O rifle é pedido por
 *   quadro, e sem o intervalo um glb que falta viraria um download por quadro.
 */

/** Tentativas por modelo, contando a primeira. */
export const MAX_LOAD_ATTEMPTS = 3

/** O intervalo entre uma falha e a tentativa seguinte. */
export const RETRY_AFTER_S = 5

export interface PrimaryLoads {
  readonly loaded: Set<PrimaryWeapon>
  readonly pending: Set<PrimaryWeapon>
  readonly attempts: Partial<Record<PrimaryWeapon, number>>
  /** Quando cada modelo falhou pela última vez, no relógio de quem chama. */
  readonly failedAtS: Partial<Record<PrimaryWeapon, number>>
}

/** Quem baixa de fato: o adapter, chamado só quando a regra deixa. */
export type StartPrimaryLoad = (weapon: PrimaryWeapon) => void

/**
 * ```ts
 * const loads = createPrimaryLoads()
 * ```
 */
export function createPrimaryLoads(): PrimaryLoads {
  return { loaded: new Set(), pending: new Set(), attempts: {}, failedAtS: {} }
}

/**
 * Quer o modelo de `weapon`: começa o download se a regra deixa, e, se ele já
 * falhou e não chegou, o das outras armas também. Idempotente e sem alocar —
 * o rifle chama por quadro.
 *
 * ```ts
 * wantPrimary(loads, 'laser', performance.now() / 1000, (weapon) => download(weapon))
 * ```
 */
export function wantPrimary(
  loads: PrimaryLoads,
  weapon: PrimaryWeapon,
  nowS: number,
  start: StartPrimaryLoad,
): void {
  startIfAllowed(loads, weapon, nowS, start)
  if (loads.loaded.has(weapon) || loads.failedAtS[weapon] === undefined) return
  startOthers(loads, weapon, nowS, start)
}

/**
 * O modelo chegou.
 *
 * ```ts
 * primaryLoaded(loads, 'laser')
 * ```
 */
export function primaryLoaded(loads: PrimaryLoads, weapon: PrimaryWeapon): void {
  loads.pending.delete(weapon)
  loads.loaded.add(weapon)
}

/**
 * O modelo falhou: ele espera o intervalo para a próxima tentativa, e as
 * outras armas são pedidas já, para a mão não ficar vazia.
 *
 * ```ts
 * primaryFailed(loads, 'laser', performance.now() / 1000, download) // pede a clássica
 * ```
 */
export function primaryFailed(
  loads: PrimaryLoads,
  weapon: PrimaryWeapon,
  nowS: number,
  start: StartPrimaryLoad,
): void {
  loads.pending.delete(weapon)
  loads.failedAtS[weapon] = nowS
  startOthers(loads, weapon, nowS, start)
}

/** Laço por índice: roda por quadro, e `filter` alocaria. */
function startOthers(
  loads: PrimaryLoads,
  failed: PrimaryWeapon,
  nowS: number,
  start: StartPrimaryLoad,
): void {
  for (let at = 0; at < PRIMARY_WEAPONS.length; at += 1) {
    const other = PRIMARY_WEAPONS[at] as PrimaryWeapon
    if (other !== failed) startIfAllowed(loads, other, nowS, start)
  }
}

function startIfAllowed(
  loads: PrimaryLoads,
  weapon: PrimaryWeapon,
  nowS: number,
  start: StartPrimaryLoad,
): void {
  if (!mayStart(loads, weapon, nowS)) return
  loads.pending.add(weapon)
  loads.attempts[weapon] = (loads.attempts[weapon] ?? 0) + 1
  start(weapon)
}

function mayStart(loads: PrimaryLoads, weapon: PrimaryWeapon, nowS: number): boolean {
  if (loads.loaded.has(weapon) || loads.pending.has(weapon)) return false
  if ((loads.attempts[weapon] ?? 0) >= MAX_LOAD_ATTEMPTS) return false
  const failedAtS = loads.failedAtS[weapon]
  return failedAtS === undefined || nowS - failedAtS >= RETRY_AFTER_S
}
