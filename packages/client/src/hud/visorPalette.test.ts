import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VISOR_PALETTE } from './visorPalette.ts'

const THEME = readFileSync(new URL('./arenaTheme.css', import.meta.url), 'utf8')

/** O nome do token no css para cada chave do espelho. */
const TOKEN_OF: Readonly<Record<keyof typeof VISOR_PALETTE, string>> = {
  red: '--hud-red',
  redDim: '--hud-red-dim',
  yellow: '--hud-yellow',
  orange: '--hud-orange',
  white: '--hud-white',
  grey: '--hud-grey',
  greyDim: '--hud-grey-dim',
  ink: '--hud-ink',
}

function tokenValue(token: string): string | undefined {
  return new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`).exec(THEME)?.[1]?.toLowerCase()
}

describe('VISOR_PALETTE', () => {
  it.each(Object.keys(TOKEN_OF) as (keyof typeof VISOR_PALETTE)[])(
    '%s é o mesmo valor do arenaTheme.css',
    (key) => {
      expect(VISOR_PALETTE[key]).toBe(tokenValue(TOKEN_OF[key]))
    },
  )
})
