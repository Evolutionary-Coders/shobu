import { NARRATOR_VOICE_LABELS } from '../audio/soundCatalog.ts'

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
  /** Volume da música, de 0 a 100. */
  readonly musicVolume: number
  /** Volume dos efeitos: tiro, passo, luneta, medalha. */
  readonly sfxVolume: number
  readonly narratorVolume: number
  /** Índice na lista de vozes do `soundCatalog.ts`. 0 é a vega, que é o padrão. */
  readonly narratorVoice: number
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
  /**
   * Os rótulos de um ajuste de **escolha**, indexados pelo valor. Presente,
   * o menu escreve o rótulo em vez do número, e mais nada muda: a faixa
   * continua sendo `0` até `choices.length - 1`, o passo continua 1, e a seta
   * continua parando nas pontas como em qualquer outro ajuste.
   */
  readonly choices?: readonly string[]
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
  // os três volumes andam de 5 em 5: vinte passos cobrem o curso inteiro sem
  // a seta presa levar um minuto de ponta a ponta, e a curva de `volumeMix.ts`
  // é que espalha a diferença audível por eles.
  {
    key: 'musicVolume',
    label: 'VOLUME DA MÚSICA',
    minInclusive: 0,
    maxInclusive: 100,
    step: 5,
    fallback: 60,
    decimals: 0,
    unit: '%',
  },
  {
    key: 'sfxVolume',
    label: 'VOLUME DOS EFEITOS',
    minInclusive: 0,
    maxInclusive: 100,
    step: 5,
    fallback: 80,
    decimals: 0,
    unit: '%',
  },
  // acima dos efeitos: a fala nomeia a medalha, e perdê-la sob um tiro é
  // perder a única informação que ela carrega.
  {
    key: 'narratorVolume',
    label: 'VOLUME DO NARRADOR',
    minInclusive: 0,
    maxInclusive: 100,
    step: 5,
    fallback: 90,
    decimals: 0,
    unit: '%',
  },
  {
    key: 'narratorVoice',
    label: 'NARRADOR',
    minInclusive: 0,
    maxInclusive: NARRATOR_VOICE_LABELS.length - 1,
    step: 1,
    fallback: 0,
    decimals: 0,
    unit: '',
    choices: NARRATOR_VOICE_LABELS,
  },
]

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
  musicVolume: specFor('musicVolume').fallback,
  sfxVolume: specFor('sfxVolume').fallback,
  narratorVolume: specFor('narratorVolume').fallback,
  narratorVoice: specFor('narratorVoice').fallback,
}
