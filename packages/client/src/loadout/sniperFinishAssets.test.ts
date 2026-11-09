import { existsSync, statSync } from 'node:fs'
import { PRIMARY_WEAPONS } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { primaryThumbnailUrl, SNIPER_FINISHES, sniperSkinUrls } from './weaponFinishes.ts'

/**
 * A trava entre o catálogo e o `sniper_finishes.py`: todo arquivo que o
 * cliente pede para um acabamento existe, e cabe no orçamento. Um acabamento
 * novo no catálogo sem rodar o script, ou um id trocado de um lado só, cai
 * aqui e não num 404 no meio da partida.
 */
const PUBLIC_DIR = new URL('../../public', import.meta.url)

/**
 * O teto de um arquivo de acabamento: o maior atlas medido foi o HOLO, ~43 kB.
 * É o que cada jogador baixa por arma, no celular.
 */
const MAX_FINISH_BYTES = 64 * 1024

function urlsOf(primary: (typeof PRIMARY_WEAPONS)[number]): string[] {
  return SNIPER_FINISHES.flatMap((finish) => {
    const skin = sniperSkinUrls(primary, finish)
    const pairs = skin ? [skin.body, ...(skin.palette ? [skin.palette] : [])] : []
    return [primaryThumbnailUrl(primary, finish), ...pairs.flatMap((p) => [p.base, p.glow])]
  })
}

describe('os arquivos dos acabamentos da sniper', () => {
  it.each(PRIMARY_WEAPONS)('existem e cabem no orçamento na arma %s', (primary) => {
    for (const url of urlsOf(primary)) {
      const file = new URL(`${PUBLIC_DIR.pathname}${url}`, 'file://')
      expect(existsSync(file), url).toBe(true)
      expect(statSync(file).size, url).toBeLessThanOrEqual(MAX_FINISH_BYTES)
    }
  })
})
