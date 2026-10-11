import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLAYER_SETTING_KEYS } from '../settings/parsePlayerSettings.ts'

/**
 * As linhas das configurações moram no `index.html`, e o modelo do menu as
 * conta pela tabela (`playerSettingsSpec.ts`). Uma linha nova na tabela sem a
 * linha no html desalinha tudo em silêncio: o cursor no índice 0 aponta para a
 * dificuldade e o colchete aparece na sensibilidade, e a seta mexe num ajuste
 * que a tela não mostra (achado no navegador, 11/10).
 */
const INDEX_HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

function settingsList(): string {
  const start = INDEX_HTML.indexOf('<div id="menu-settings"')
  return INDEX_HTML.slice(start, INDEX_HTML.indexOf('</ul>', start))
}

describe('as linhas de configuração do index.html', () => {
  it('seguem a ordem da tabela, uma por ajuste', () => {
    const shown = [...settingsList().matchAll(/data-setting="([^"]+)"/g)].map((match) => match[1])
    expect(shown).toEqual(PLAYER_SETTING_KEYS)
  })

  it('têm índices em sequência a partir de zero, contando as linhas de ação', () => {
    const indices = [...settingsList().matchAll(/data-index="(\d+)"/g)].map((match) =>
      Number(match[1]),
    )
    expect(indices).toEqual(indices.map((_, position) => position))
  })
})
