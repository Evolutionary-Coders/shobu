import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BLADE_HINT_MS, bladeHintText, createBladeHintWatch, stepBladeHint } from './bladeHint.ts'

describe('bladeHintText', () => {
  it('diz o caminho de volta da entrada em uso', () => {
    expect(bladeHintText('keyboard')).toBe('1 / RODA — SNIPER')
    expect(bladeHintText('gamepad')).toBe('D-PAD ↑ — SNIPER')
  })

  it('no toque não há dica: o botão da lâmina já diz SNIPER', () => {
    expect(bladeHintText('touch')).toBeNull()
  })
})

describe('stepBladeHint', () => {
  it('sem lâmina, não escreve nada', () => {
    expect(stepBladeHint(createBladeHintWatch(), false, 'keyboard')).toBeUndefined()
  })

  it('acende no saque, uma vez, e apaga ao guardar', () => {
    const watch = createBladeHintWatch()
    expect(stepBladeHint(watch, true, 'keyboard')).toBe('1 / RODA — SNIPER')
    expect(stepBladeHint(watch, true, 'keyboard')).toBeUndefined()
    expect(stepBladeHint(watch, false, 'keyboard')).toBeNull()
    expect(stepBladeHint(watch, false, 'keyboard')).toBeUndefined()
  })

  it('acende de novo a cada saque', () => {
    const watch = createBladeHintWatch()
    stepBladeHint(watch, true, 'keyboard')
    stepBladeHint(watch, false, 'keyboard')
    expect(stepBladeHint(watch, true, 'keyboard')).toBe('1 / RODA — SNIPER')
  })

  it('trocar de entrada com a lâmina na mão troca a dica', () => {
    const watch = createBladeHintWatch()
    stepBladeHint(watch, true, 'keyboard')
    expect(stepBladeHint(watch, true, 'gamepad')).toBe('D-PAD ↑ — SNIPER')
    expect(stepBladeHint(watch, true, 'touch')).toBeNull()
  })

  it('trocar de entrada sem a lâmina não escreve nada', () => {
    const watch = createBladeHintWatch()
    expect(stepBladeHint(watch, false, 'gamepad')).toBeUndefined()
  })
})

/** A dica some por animação de css: constante e css discordando é dica que some cedo. */
describe('a vida da dica no css', () => {
  it.each(['a', 'b'])('blade-hint-%s dura BLADE_HINT_MS', (variant) => {
    const css = readFileSync(new URL('./arenaPanels.css', import.meta.url), 'utf8')
    expect(css).toContain(`animation: blade-hint-${variant} ${BLADE_HINT_MS}ms linear both`)
  })
})
