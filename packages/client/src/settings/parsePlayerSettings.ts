import {
  DEFAULT_PLAYER_SETTINGS,
  PLAYER_SETTINGS_SPEC,
  type PlayerSettingSpec,
  type PlayerSettings,
  specFor,
} from './playerSettingsSpec.ts'

/**
 * Lê configurações de origem desconhecida e **nunca lança**.
 *
 * É a assimetria deliberada com o `parseGameplayConfig`, que lança em tudo: o
 * `config/gameplay.json` é escrito por quem desenvolve, e valor errado lá é erro
 * de digitação que tem que gritar. Isto aqui vem do armazenamento do navegador,
 * que o jogador edita, que extensão corrompe e que muda de formato entre
 * versões do jogo. Lançar significaria jogador que não entra no jogo por causa
 * de uma letra num campo de sensibilidade — na feira, com a fila esperando.
 *
 * Campo ausente, de tipo errado ou fora da faixa cai no padrão da tabela. O
 * resto é aproveitado.
 *
 * ```ts
 * parsePlayerSettings({ fieldOfViewDeg: 9999 }) // fieldOfViewDeg volta a 90
 * ```
 */
export function parsePlayerSettings(raw: unknown): PlayerSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PLAYER_SETTINGS
  const record = raw as Record<string, unknown>
  return {
    mouseSensitivity: readField(record, 'mouseSensitivity'),
    scopeSensitivity: readField(record, 'scopeSensitivity'),
    fieldOfViewDeg: readField(record, 'fieldOfViewDeg'),
    musicVolume: readField(record, 'musicVolume'),
    sfxVolume: readField(record, 'sfxVolume'),
    narratorVolume: readField(record, 'narratorVolume'),
    narratorVoice: readField(record, 'narratorVoice'),
  }
}

function readField(record: Record<string, unknown>, key: keyof PlayerSettings): number {
  const spec = specFor(key)
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return spec.fallback
  return clampToSpec(spec, value)
}

/**
 * Recorta em vez de recusar: quem editou o armazenamento à mão e pôs 9999 no
 * campo de visão quis o máximo, não o padrão.
 */
export function clampToSpec(spec: PlayerSettingSpec, value: number): number {
  return Math.min(spec.maxInclusive, Math.max(spec.minInclusive, value))
}

/** Um passo de seta, já recortado na faixa. */
export function adjustPlayerSetting(
  settings: PlayerSettings,
  key: keyof PlayerSettings,
  direction: -1 | 1,
): PlayerSettings {
  const spec = specFor(key)
  // duas limpezas, e as duas precisam: a divisão pelo passo tira o acúmulo de
  // vinte setas, e o corte nas casas tira o resto binário — `14 * 0.05` ainda
  // sai `0.7000000000000001`, e é isso que iria parar no armazenamento.
  const stepped = settings[key] + spec.step * direction
  const rounded = Number((Math.round(stepped / spec.step) * spec.step).toFixed(spec.decimals))
  return { ...settings, [key]: clampToSpec(spec, rounded) }
}

/** O número como ele aparece na tela, com a unidade. */
export function formatPlayerSetting(key: keyof PlayerSettings, value: number): string {
  const spec = specFor(key)
  // ajuste de escolha escreve o rótulo, não o índice: "VEGA" e não "0".
  const choice = spec.choices?.[value]
  if (choice !== undefined) return choice
  return `${value.toFixed(spec.decimals)}${spec.unit}`
}

/** Verdade quando o ajuste está no padrão de fábrica. O menu marca os que não estão. */
export function isPlayerSettingDefault(key: keyof PlayerSettings, value: number): boolean {
  return Math.abs(value - specFor(key).fallback) < specFor(key).step / 2
}

/** As chaves na ordem da tabela, que é a ordem da tela. */
export const PLAYER_SETTING_KEYS: readonly (keyof PlayerSettings)[] = PLAYER_SETTINGS_SPEC.map(
  (spec) => spec.key,
)
