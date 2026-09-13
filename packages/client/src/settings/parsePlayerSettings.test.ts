import { describe, expect, it } from 'vitest'
import {
  adjustPlayerSetting,
  clampToSpec,
  formatPlayerSetting,
  isPlayerSettingDefault,
  PLAYER_SETTING_KEYS,
  parsePlayerSettings,
} from './parsePlayerSettings.ts'
import { DEFAULT_PLAYER_SETTINGS, specFor } from './playerSettingsSpec.ts'

/**
 * A assimetria que importa: o parser do `gameplay.json` lança em tudo, este
 * nunca lança. Armazenamento do navegador é editável pelo jogador e corrompível
 * por extensão; jogo que não abre por causa de um campo sujo é pior que jogo
 * que abre no padrão.
 */
describe('parsePlayerSettings: nunca lança', () => {
  it.each([null, undefined, 42, 'texto', []])('%s vira o padrão inteiro', (raw) => {
    expect(parsePlayerSettings(raw)).toEqual(DEFAULT_PLAYER_SETTINGS)
  })

  it('campo ausente cai no padrão e o resto é aproveitado', () => {
    const parsed = parsePlayerSettings({ fieldOfViewDeg: 110 })
    expect(parsed.fieldOfViewDeg).toBe(110)
    expect(parsed.mouseSensitivity).toBe(DEFAULT_PLAYER_SETTINGS.mouseSensitivity)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 'dois', null])(
    'campo não finito (%s) cai no padrão',
    (value) => {
      expect(parsePlayerSettings({ mouseSensitivity: value }).mouseSensitivity).toBe(
        DEFAULT_PLAYER_SETTINGS.mouseSensitivity,
      )
    },
  )

  /** Quem editou o arquivo à mão e pôs 9999 quis o máximo, não o padrão. */
  it('valor fora da faixa é recortado, não descartado', () => {
    expect(parsePlayerSettings({ fieldOfViewDeg: 9999 }).fieldOfViewDeg).toBe(
      specFor('fieldOfViewDeg').maxInclusive,
    )
    expect(parsePlayerSettings({ fieldOfViewDeg: -5 }).fieldOfViewDeg).toBe(
      specFor('fieldOfViewDeg').minInclusive,
    )
  })

  it('sobrevive a chave desconhecida, que é o formato de uma versão futura', () => {
    expect(parsePlayerSettings({ fieldOfViewDeg: 100, gancho: true }).fieldOfViewDeg).toBe(100)
  })
})

describe('adjustPlayerSetting', () => {
  it('anda um passo para cada lado', () => {
    const spec = specFor('fieldOfViewDeg')
    const subiu = adjustPlayerSetting(DEFAULT_PLAYER_SETTINGS, 'fieldOfViewDeg', 1)
    expect(subiu.fieldOfViewDeg).toBe(spec.fallback + spec.step)
    expect(adjustPlayerSetting(subiu, 'fieldOfViewDeg', -1).fieldOfViewDeg).toBe(spec.fallback)
  })

  it('para no teto e no piso em vez de passar', () => {
    const spec = specFor('fieldOfViewDeg')
    let settings = DEFAULT_PLAYER_SETTINGS
    for (let step = 0; step < 500; step += 1) {
      settings = adjustPlayerSetting(settings, 'fieldOfViewDeg', 1)
    }
    expect(settings.fieldOfViewDeg).toBe(spec.maxInclusive)
    for (let step = 0; step < 500; step += 1) {
      settings = adjustPlayerSetting(settings, 'fieldOfViewDeg', -1)
    }
    expect(settings.fieldOfViewDeg).toBe(spec.minInclusive)
  })

  /** Vinte setas em ponto flutuante viram 1,0500000000000003 sem o arredondamento ao passo. */
  it('não acumula sujeira de ponto flutuante', () => {
    let settings = DEFAULT_PLAYER_SETTINGS
    for (let step = 0; step < 20; step += 1) {
      settings = adjustPlayerSetting(settings, 'mouseSensitivity', 1)
    }
    expect(formatPlayerSetting('mouseSensitivity', settings.mouseSensitivity)).toBe('2.00')
  })

  it('não mexe nos outros ajustes', () => {
    const mexido = adjustPlayerSetting(DEFAULT_PLAYER_SETTINGS, 'mouseSensitivity', 1)
    expect(mexido.fieldOfViewDeg).toBe(DEFAULT_PLAYER_SETTINGS.fieldOfViewDeg)
  })
})

describe('formatPlayerSetting', () => {
  it('o campo de visão sai inteiro e com grau', () => {
    expect(formatPlayerSetting('fieldOfViewDeg', 90)).toBe('90°')
  })

  it('a sensibilidade sai com duas casas e sem unidade', () => {
    expect(formatPlayerSetting('mouseSensitivity', 1)).toBe('1.00')
  })
})

describe('isPlayerSettingDefault', () => {
  it('reconhece o padrão de fábrica', () => {
    expect(isPlayerSettingDefault('fieldOfViewDeg', 90)).toBe(true)
  })

  it('reconhece um passo de distância como mexido', () => {
    expect(isPlayerSettingDefault('fieldOfViewDeg', 91)).toBe(false)
  })
})

describe('clampToSpec', () => {
  it('deixa passar o que já está na faixa', () => {
    expect(clampToSpec(specFor('fieldOfViewDeg'), 100)).toBe(100)
  })
})

describe('PLAYER_SETTING_KEYS', () => {
  it('segue a ordem da tabela, que é a ordem da tela', () => {
    expect(PLAYER_SETTING_KEYS).toEqual(['mouseSensitivity', 'scopeSensitivity', 'fieldOfViewDeg'])
  })
})

/**
 * O que ia parar no `localStorage`: `14 * 0.05` sai `0.7000000000000001` em
 * binário, e `toFixed` na tela escondia isso do olho mas não do arquivo.
 */
describe('adjustPlayerSetting: o valor guardado é limpo', () => {
  it.each([6, 14, 20, 37])('%s passos não deixam resto binário', (passos) => {
    let settings = DEFAULT_PLAYER_SETTINGS
    for (let step = 0; step < passos; step += 1) {
      settings = adjustPlayerSetting(settings, 'mouseSensitivity', -1)
    }
    const serializado = JSON.parse(JSON.stringify(settings)) as typeof settings
    expect(String(serializado.mouseSensitivity)).not.toMatch(/\d{6,}/)
  })
})
