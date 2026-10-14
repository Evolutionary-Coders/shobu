import { NARRATOR_VOICES, type NarratorVoice } from '../audio/soundCatalog.ts'
import type { PlayerSettings } from './playerSettingsSpec.ts'

/**
 * A versão do json das configurações. Ela existe por causa do narrador: a voz
 * é guardada como **índice** na lista do `soundCatalog.ts`, e vozes novas
 * entraram na frente da lista duas vezes — o índice guardado passou a apontar
 * para outra voz.
 *
 * Cada versão registra a ordem da lista em que o índice foi escrito:
 *
 * - **1** (json sem `version`): a ordem com que o `main` saiu, VEGA primeiro;
 * - **2**: o COMANDANTE na frente (6c66206). Nenhum build escreveu `version`
 *   nela — a versão só nasceu depois —, e nenhum `main` a publicou, então um
 *   json desta época lê como 1; a ordem fica aqui para a história ser explícita;
 * - **3**: as três personas na frente (6af299b), a ordem de hoje.
 */
export const PLAYER_SETTINGS_VERSION = 3

const NARRATOR_ORDER_BY_VERSION: Readonly<Record<number, readonly NarratorVoice[]>> = {
  1: ['vega-pt-BR', 'athena-pt-BR', 'ramattra-pt-BR', 'zenyatta-pt-BR'],
  2: ['comandante-pt-BR', 'vega-pt-BR', 'athena-pt-BR', 'ramattra-pt-BR', 'zenyatta-pt-BR'],
  [PLAYER_SETTINGS_VERSION]: NARRATOR_VOICES,
}

/**
 * O json guardado, com a voz do narrador traduzida para a ordem de hoje. Quem
 * escolheu a VEGA numa versão velha continua com a VEGA, e não com a voz que
 * hoje ocupa aquele índice. Nunca lança: o resto da validação é do
 * `parsePlayerSettings`, que recebe o que sai daqui.
 *
 * ```ts
 * migratePlayerSettings({ narratorVoice: 0 }) // { narratorVoice: 3 }: a VEGA de antes
 * ```
 */
export function migratePlayerSettings(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw
  const record = raw as Record<string, unknown>
  const index = record.narratorVoice
  if (typeof index !== 'number') return raw
  const voice = NARRATOR_ORDER_BY_VERSION[versionOf(record)]?.[index]
  if (!voice) return raw
  return { ...record, narratorVoice: NARRATOR_VOICES.indexOf(voice) }
}

/** Sem `version` é a 1: o `main` guardou json sem ela. */
function versionOf(record: Record<string, unknown>): number {
  return typeof record.version === 'number' ? record.version : 1
}

/**
 * O que vai para o armazenamento: as configurações e a versão em que os
 * índices delas foram escritos.
 *
 * ```ts
 * versionedPlayerSettings(settings).version // PLAYER_SETTINGS_VERSION
 * ```
 */
export function versionedPlayerSettings(
  settings: PlayerSettings,
): PlayerSettings & { readonly version: number } {
  return { ...settings, version: PLAYER_SETTINGS_VERSION }
}
