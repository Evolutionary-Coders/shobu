import { describe, expect, it } from 'vitest'
import { NARRATOR_VOICE_LABELS, NARRATOR_VOICES } from '../audio/soundCatalog.ts'
import { DEFAULT_PLAYER_SETTINGS } from './playerSettingsSpec.ts'
import {
  migratePlayerSettings,
  PLAYER_SETTINGS_VERSION,
  versionedPlayerSettings,
} from './playerSettingsVersion.ts'

/** O rótulo da voz que o json migrado escolhe, como o menu o escreveria. */
function voiceLabelOf(raw: unknown): string | undefined {
  const migrated = migratePlayerSettings(raw) as { narratorVoice: number }
  return NARRATOR_VOICE_LABELS[migrated.narratorVoice]
}

describe('migratePlayerSettings', () => {
  it.each([
    [0, 'VEGA'],
    [1, 'ATHENA'],
    [2, 'RAMATTRA'],
    [3, 'ZENYATTA'],
  ])('o json sem versão, do main, guarda %i: continua %s', (index, label) => {
    // regressão: as vozes novas entraram na frente da lista, e o índice velho
    // passou a tocar outra voz.
    expect(voiceLabelOf({ narratorVoice: index })).toBe(label)
  })

  it('a ordem do COMANDANTE na frente é conhecida pela versão 2', () => {
    expect(voiceLabelOf({ version: 2, narratorVoice: 0 })).toBe('COMANDANTE')
    expect(voiceLabelOf({ version: 2, narratorVoice: 1 })).toBe('VEGA')
  })

  it('a versão de hoje fica como está', () => {
    const today = { version: PLAYER_SETTINGS_VERSION, narratorVoice: 2 }
    expect(migratePlayerSettings(today)).toEqual(today)
  })

  it('mantém os outros campos', () => {
    expect(migratePlayerSettings({ narratorVoice: 0, fieldOfViewDeg: 100 })).toMatchObject({
      fieldOfViewDeg: 100,
    })
  })

  it.each([
    null,
    'texto',
    {},
    { narratorVoice: '0' },
    { narratorVoice: 99 },
    { version: 999, narratorVoice: 0 },
  ])('deixa %j para o parser decidir', (raw) => {
    expect(migratePlayerSettings(raw)).toBe(raw)
  })
})

describe('versionedPlayerSettings', () => {
  it('guarda a versão junto, e a leitura dela não muda nada', () => {
    const stored = versionedPlayerSettings(DEFAULT_PLAYER_SETTINGS)
    expect(stored.version).toBe(PLAYER_SETTINGS_VERSION)
    expect(migratePlayerSettings(stored)).toEqual(stored)
  })

  it('a versão de hoje lê a lista de hoje', () => {
    expect(voiceLabelOf({ version: PLAYER_SETTINGS_VERSION, narratorVoice: 0 })).toBe(
      NARRATOR_VOICE_LABELS[0],
    )
    expect(NARRATOR_VOICES.length).toBe(NARRATOR_VOICE_LABELS.length)
  })
})
