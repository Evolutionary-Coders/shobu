import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseNarratorManifest, pickTake } from './narratorManifest.ts'

/** O manifesto de verdade, publicado pela bancada: o teste não inventa forma. */
const VEGA = parseNarratorManifest(
  JSON.parse(
    readFileSync(
      new URL('../../../../audio/voicelines/vega-pt-BR/manifest.json', import.meta.url),
      'utf8',
    ),
  ),
)

describe('parseNarratorManifest', () => {
  it('lê o locale que a bancada escreveu', () => {
    expect(VEGA.locale).toBe('pt-BR')
  })

  it('indexa os takes por slug', () => {
    expect(VEGA.clips.get('double-kill')?.length).toBeGreaterThan(0)
  })

  it('cada take traz o arquivo e o texto falado', () => {
    const take = VEGA.clips.get('intro')?.[0]
    expect(take?.file).toMatch(/^intro-\d+\.webm$/)
    expect(take?.text.length).toBeGreaterThan(0)
  })

  it('take sem texto não derruba a carga: o texto é para depurar', () => {
    const manifest = parseNarratorManifest({ locale: 'pt-BR', clips: { oi: [{ file: 'a.webm' }] } })
    expect(manifest.clips.get('oi')?.[0]?.text).toBe('')
  })

  it.each([null, 42, []])('recusa manifesto %s, dizendo o que recebeu', (raw) => {
    expect(() => parseNarratorManifest(raw)).toThrow(/manifesto recebeu/)
  })

  it('recusa locale que não é string', () => {
    expect(() => parseNarratorManifest({ locale: 1, clips: {} })).toThrow(/manifesto.locale/)
  })

  it('recusa clips que não é objeto', () => {
    expect(() => parseNarratorManifest({ locale: 'pt-BR', clips: 'x' })).toThrow(/manifesto.clips/)
  })

  it('recusa slug sem take nenhum, dizendo qual slug', () => {
    expect(() => parseNarratorManifest({ locale: 'pt-BR', clips: { skeet: [] } })).toThrow(/skeet/)
  })

  it('recusa take sem arquivo, dizendo qual slug', () => {
    const raw = { locale: 'pt-BR', clips: { skeet: [{ text: 'oi' }] } }
    expect(() => parseNarratorManifest(raw)).toThrow(/clips.skeet\[\].file/)
  })

  it('recusa take que não é objeto', () => {
    const raw = { locale: 'pt-BR', clips: { skeet: ['skeet-01.webm'] } }
    expect(() => parseNarratorManifest(raw)).toThrow(/clips.skeet\[\]/)
  })
})

describe('pickTake', () => {
  it('sorteia dentro dos takes do slug', () => {
    const takes = VEGA.clips.get('match-start') ?? []
    for (const unit of [0, 0.5, 0.999]) {
      expect(takes).toContain(pickTake(VEGA, 'match-start', unit))
    }
  })

  it('o zero pega o primeiro take', () => {
    expect(pickTake(VEGA, 'intro', 0)?.file).toBe('intro-01.webm')
  })

  it('slug sem fala cala em vez de lançar', () => {
    expect(pickTake(VEGA, 'quadruple-kill', 0)).toBeUndefined()
  })

  it.each([1, 1.5, -0.5])('sorteio fora da faixa (%s) ainda devolve um take', (unit) => {
    expect(pickTake(VEGA, 'intro', unit)).toBeDefined()
  })
})
