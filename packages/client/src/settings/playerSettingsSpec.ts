/**
 * O que o jogador controla no menu, e a faixa de cada número.
 *
 * Tabela de dados no molde do `gameplayConfigSpec.ts`, e pelo mesmo motivo: o
 * parser, o menu e o teste leem a **mesma** tabela, então acrescentar um ajuste
 * é acrescentar uma linha aqui, e não mexer em quatro arquivos.
 *
 * Estes números **não** são de gameplay e não moram no `config/gameplay.json`
 * (ADR 0005 é sobre balanço, e isto é preferência): dois jogadores na mesma sala
 * têm sensibilidades diferentes sem que a simulação mude. O único que também é
 * de gameplay é o campo de visão, e por isso o padrão dele é lido de lá em vez
 * de repetido aqui — ver `playerSettingsSpec.test.ts`.
 */
export interface PlayerSettings {
  /** Multiplicador sobre a sensibilidade de base. Maior é mais rápido. */
  readonly mouseSensitivity: number
  /** Multiplicador sobre a de base, **já com a luneta aberta**. */
  readonly scopeSensitivity: number
  readonly fieldOfViewDeg: number
}

export interface PlayerSettingSpec {
  readonly key: keyof PlayerSettings
  /** O rótulo que aparece na tela, já em caixa alta. */
  readonly label: string
  readonly minInclusive: number
  readonly maxInclusive: number
  /** Quanto uma seta anda. */
  readonly step: number
  readonly fallback: number
  /** Casas decimais na tela. Zero quer dizer inteiro. */
  readonly decimals: number
  /** Sufixo da unidade, ou vazio quando o número é adimensional. */
  readonly unit: string
}

/**
 * O piso de 60° não é gosto: a luneta fecha para `camera.scopedFovDeg`, que é
 * 22, e um fov de jogador abaixo disso inverteria a mira — ela **abriria** o
 * campo em vez de fechar. O teto de 120 é o valor que o jogo entregava antes de
 * o menu existir, e continua alcançável.
 *
 * A sensibilidade vai de 0,20 a 5,00 porque é multiplicador: 1,00 é a mira que
 * o jogo sempre teve, e as pontas cobrem de quem joga com o braço a quem joga
 * com o pulso sem virar ajuste inútil nas bordas.
 */
export const PLAYER_SETTINGS_SPEC: readonly PlayerSettingSpec[] = [
  {
    key: 'mouseSensitivity',
    label: 'SENSIBILIDADE',
    minInclusive: 0.2,
    maxInclusive: 5,
    step: 0.05,
    fallback: 1,
    decimals: 2,
    unit: '',
  },
  {
    key: 'scopeSensitivity',
    label: 'SENSIBILIDADE NA LUNETA',
    minInclusive: 0.1,
    maxInclusive: 2,
    step: 0.05,
    fallback: 1,
    decimals: 2,
    unit: '',
  },
  {
    key: 'fieldOfViewDeg',
    label: 'CAMPO DE VISÃO',
    minInclusive: 60,
    maxInclusive: 120,
    step: 1,
    fallback: 90,
    decimals: 0,
    unit: '°',
  },
]

/**
 * A linha da tabela de um ajuste. É a **única** porta de leitura da tabela, e
 * por isso a única que precisa da guarda de chave ausente.
 */
export function specFor(key: keyof PlayerSettings): PlayerSettingSpec {
  const spec = PLAYER_SETTINGS_SPEC.find((candidate) => candidate.key === key)
  if (!spec) {
    throw new RangeError(`specFor recebeu ${key}; esperado uma chave de PlayerSettings`)
  }
  return spec
}

/** Montado a partir da tabela: padrão repetido à mão é padrão que diverge. */
export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  mouseSensitivity: specFor('mouseSensitivity').fallback,
  scopeSensitivity: specFor('scopeSensitivity').fallback,
  fieldOfViewDeg: specFor('fieldOfViewDeg').fallback,
}
