import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CLASS_LOADOUT_SPEC } from '../loadout/classLoadout.ts'
import { PLAYER_SETTING_KEYS } from '../settings/parsePlayerSettings.ts'
import { LOADOUT_ACTION_ITEMS, MATCH_ACTION_ITEMS, ROOT_ITEMS } from './mainMenuModel.ts'
import { MATCH_SETUP_SPEC } from './matchSetup.ts'

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

function panelList(id: string): string {
  const start = INDEX_HTML.indexOf(`<div id="${id}"`)
  return INDEX_HTML.slice(start, INDEX_HTML.indexOf('</ul>', start))
}

describe('as linhas das telas de escolha do index.html', () => {
  it.each([
    ['menu-match', 'match', MATCH_SETUP_SPEC, MATCH_ACTION_ITEMS],
    ['menu-loadout', 'loadout', CLASS_LOADOUT_SPEC, LOADOUT_ACTION_ITEMS],
  ] as const)('%s segue a tabela e termina nas ações', (id, screen, specs, actions) => {
    const list = panelList(id)
    const shown = [...list.matchAll(/data-choice="([^"]+)"/g)].map((match) => match[1])
    expect(shown).toEqual(specs.map((spec) => `${screen}:${spec.key}`))
    const indices = [...list.matchAll(/data-index="(\d+)"/g)].map((match) => Number(match[1]))
    expect(indices).toEqual([...Array(specs.length + actions.length).keys()])
    for (const action of actions) expect(list).toContain(`>${action}</li>`)
  })

  it('a raiz tem um item por linha do modelo', () => {
    const list = INDEX_HTML.slice(INDEX_HTML.indexOf('<ul id="menu-root"'))
    const rows = [...list.slice(0, list.indexOf('</ul>')).matchAll(/data-index="(\d+)"/g)]
    expect(rows).toHaveLength(ROOT_ITEMS.length)
  })
})
