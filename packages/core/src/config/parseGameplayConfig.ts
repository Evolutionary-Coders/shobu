import type { GameplayConfig } from './gameplayConfig.ts'
import {
  type FieldOrderSpec,
  GAMEPLAY_CONFIG_SPEC,
  GAMEPLAY_FIELD_ORDER_SPEC,
  type NumericFieldSpec,
} from './gameplayConfigSpec.ts'

type UnknownRecord = Readonly<Record<string, unknown>>

const SECTIONS: readonly string[] = [...new Set(GAMEPLAY_CONFIG_SPEC.map((s) => s.section))]
const KEYS_BY_SECTION: ReadonlyMap<string, readonly string[]> = groupKeysBySection()

/**
 * Valida `config/gameplay.json` e devolve os números tipados. Chave ausente,
 * chave desconhecida, valor não numérico e valor fora de faixa são erro: a
 * ADR 0005 exige que o processo morra na carga em vez de rodar com número
 * errado, porque erro de digitação passa do texto para o jogo em silêncio.
 *
 * ```ts
 * const config = parseGameplayConfig(await (await fetch('/gameplay.json')).json())
 * console.log(config.movement.runSpeedMps)
 * ```
 *
 * @throws TypeError formato errado ou chave desconhecida
 * @throws RangeError número fora da faixa de sanidade, ou dois números fora de ordem
 */
export function parseGameplayConfig(raw: unknown): GameplayConfig {
  const root = asRecord(raw, 'gameplay config')
  assertKnownKeys(root, SECTIONS, 'gameplay config')
  for (const spec of GAMEPLAY_CONFIG_SPEC) validateField(root, spec)
  for (const [section, keys] of KEYS_BY_SECTION) {
    assertKnownKeys(asRecord(root[section], section), keys, section)
  }
  for (const order of GAMEPLAY_FIELD_ORDER_SPEC) assertFieldOrder(root, order)
  return raw as GameplayConfig
}

function validateField(root: UnknownRecord, spec: NumericFieldSpec): void {
  const path = `${spec.section}.${spec.key}`
  const value = asRecord(root[spec.section], spec.section)[spec.key]
  const range = `entre ${spec.minInclusive} e ${spec.maxInclusive} (inclusive)`
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} recebeu ${describe(value)}; esperado número finito ${range}`)
  }
  if (value < spec.minInclusive || value > spec.maxInclusive) {
    throw new RangeError(`${path} recebeu ${value}; esperado ${range}`)
  }
}

function assertFieldOrder(root: UnknownRecord, order: FieldOrderSpec): void {
  const section = asRecord(root[order.section], order.section)
  const below = section[order.below] as number
  const above = section[order.above] as number
  if (below < above) return
  throw new RangeError(
    `${order.section}.${order.below} recebeu ${below} e ${order.section}.${order.above} ` +
      `recebeu ${above}; esperado ${order.below} menor que ${order.above}`,
  )
}

function assertKnownKeys(record: UnknownRecord, allowed: readonly string[], where: string): void {
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key))
  if (unknown.length === 0) return
  const found = unknown.join(', ')
  throw new TypeError(
    `${where} tem chave desconhecida: ${found}; esperado só ${allowed.join(', ')}`,
  )
}

function asRecord(value: unknown, where: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${where} recebeu ${describe(value)}; esperado objeto`)
  }
  return value as UnknownRecord
}

function describe(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

function groupKeysBySection(): ReadonlyMap<string, readonly string[]> {
  const grouped = new Map<string, string[]>()
  for (const spec of GAMEPLAY_CONFIG_SPEC) {
    const keys = grouped.get(spec.section)
    if (keys) keys.push(spec.key)
    else grouped.set(spec.section, [spec.key])
  }
  return grouped
}
