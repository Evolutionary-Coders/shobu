import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * O hud da arena fala em três famílias de cor: vermelho, branco/cinza e
 * amarelo/laranja. Ciano, lima e violeta são os acentos do competidor
 * (`competitorPalette.ts`), e uma cor dessas no canto da tela é o olho
 * procurando o alvo e achando o hud.
 *
 * Css não entra em cobertura, então quem tranca a paleta é este teste, lendo
 * os arquivos. As medalhas ficam de fora: a cor delas é a escada de raridade da
 * arte (`docs/medals.md`), e não cor do hud.
 */
const HUD_STYLESHEETS = [
  'arenaTheme.css',
  'arenaComponents.css',
  'arenaPanels.css',
  'arenaReticle.css',
  'arenaScope.css',
  'arenaBoundary.css',
  'arenaVisor.css',
  'arenaScoreboard.css',
  'arenaMatchEnd.css',
]

/**
 * Abaixo deste croma a cor é cinza, e cinza não tem família. Croma, e não a
 * saturação do hsl: no hsl o quase-preto da placa sai saturado, porque a conta
 * divide por uma luminosidade perto de zero.
 */
const GREY_CHROMA = 0.12

/** Vermelho vai de 330° a 360°; amarelo e laranja, de 0° a 60°. */
function isHudHue(hueDeg: number): boolean {
  return hueDeg <= 60 || hueDeg >= 330
}

function css(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
}

type Rgb = readonly [number, number, number]

function hexColors(source: string): Rgb[] {
  return [...source.matchAll(/#([0-9a-f]{6})\b/gi)].map((match) => {
    const hex = match[1] ?? ''
    const channel = (at: number): number => Number.parseInt(hex.slice(at, at + 2), 16)
    return [channel(0), channel(2), channel(4)] as const
  })
}

function rgbColors(source: string): Rgb[] {
  return [...source.matchAll(/rgb\((\d+) (\d+) (\d+)/g)].map(
    (match) => [Number(match[1]), Number(match[2]), Number(match[3])] as const,
  )
}

function hueAndChroma([r, g, b]: Rgb): { hue: number; chroma: number } {
  const max = Math.max(r, g, b) / 255
  const delta = max - Math.min(r, g, b) / 255
  if (delta === 0) return { hue: 0, chroma: 0 }
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const sector =
    max === rn
      ? ((gn - bn) / delta) % 6
      : max === gn
        ? (bn - rn) / delta + 2
        : (rn - gn) / delta + 4
  return { hue: (sector * 60 + 360) % 360, chroma: delta }
}

describe('a paleta do hud da arena', () => {
  it.each(HUD_STYLESHEETS)('%s só usa vermelho, amarelo, laranja e cinza', (file) => {
    const source = css(file)
    const colors = [...hexColors(source), ...rgbColors(source)]
    const strays = colors.filter((color) => {
      const { hue, chroma } = hueAndChroma(color)
      return chroma > GREY_CHROMA && !isHudHue(hue)
    })
    expect(strays, `${file} tem cor fora da paleta do hud`).toEqual([])
  })

  it('a conta de matiz reconhece os acentos do competidor como fora da paleta', () => {
    const accents: Rgb[] = [
      [51, 242, 255],
      [140, 255, 51],
      [173, 92, 255],
    ]
    expect(accents.map((color) => isHudHue(hueAndChroma(color).hue))).toEqual([false, false, false])
  })

  it('e reconhece as cores do hud como dentro dela', () => {
    const hud: Rgb[] = [
      [255, 42, 60],
      [255, 210, 60],
      [255, 138, 30],
    ]
    expect(hud.map((color) => isHudHue(hueAndChroma(color).hue))).toEqual([true, true, true])
  })
})

/**
 * O glitch de troca de número tem que ser curto: mais que 150 ms e ele deixa
 * de ser um tremor e vira o número ilegível na hora em que o jogador o lê.
 */
describe('o glitch dos números', () => {
  it('dura entre 100 e 150 ms', () => {
    const durations = [
      ...css('arenaComponents.css').matchAll(/animation: glyph-glitch-[ab] (\d+)ms/g),
    ].map((match) => Number(match[1]))
    expect(durations).toHaveLength(2)
    for (const ms of durations) expect(ms).toBeGreaterThanOrEqual(100)
    for (const ms of durations) expect(ms).toBeLessThanOrEqual(150)
  })

  it('sai com movimento reduzido', () => {
    const reduced = css('arenaComponents.css').slice(
      css('arenaComponents.css').indexOf('prefers-reduced-motion'),
    )
    expect(reduced).toContain('.glyph-text[data-glitch="a"]')
    expect(reduced).toContain('animation: none')
  })
})
