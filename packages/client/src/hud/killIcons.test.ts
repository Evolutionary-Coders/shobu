import { describe, expect, it } from 'vitest'
import { KILL_ICON_IDS, killIcon } from './killIcons.ts'

describe('killIcon', () => {
  it('tem um ícone para cada arma e cada marca', () => {
    expect([...KILL_ICON_IDS].sort()).toEqual(
      ['airborne', 'grapple', 'headshot', 'katana', 'knife', 'noscope', 'scoped', 'sniper'].sort(),
    )
  })

  it('a arma é larga e a marca é quadrada', () => {
    expect(killIcon('sniper')).toMatchObject({ label: 'SNIPER', width: 32, height: 12 })
    expect(killIcon('headshot')).toMatchObject({ label: 'NA CABEÇA', width: 12, height: 12 })
  })

  /** Traço fora do `viewBox` é traço cortado na tela, e ninguém nota até o jogo. */
  it.each(KILL_ICON_IDS)('%s desenha dentro da própria caixa', (id) => {
    const icon = killIcon(id)
    expect(icon.paths.length).toBeGreaterThan(0)
    for (const path of icon.paths) {
      expect(path.d).toMatch(/^M[\d. MLHVAQZ-]+$/)
      const numbers = path.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...numbers)).toBeLessThanOrEqual(Math.max(icon.width, icon.height))
    }
  })
})
