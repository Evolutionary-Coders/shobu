import { describe, expect, it } from 'vitest'
import { createNarratorCaptions } from './narratorCaptions.ts'

/** Quem lê a legenda, de mentira: guarda cada texto que a tela receberia. */
class FakeCaptionLine {
  readonly shown: (string | null)[] = []
  readonly listen = (text: string | null): void => {
    this.shown.push(text)
  }
}

function mount() {
  const captions = createNarratorCaptions()
  const line = new FakeCaptionLine()
  captions.subscribe(line.listen)
  return { captions, line }
}

describe('createNarratorCaptions', () => {
  it('mostra o texto quando a fala começa a soar, e apaga quando ela acaba', () => {
    const { captions, line } = mount()
    const cue = captions.cueFor('Double kill.')
    expect(line.shown).toEqual([])
    cue.started()
    cue.ended()
    expect(line.shown).toEqual(['Double kill.', null])
  })

  /** O mixer avisa o fim da cortada depois que a nova começou. */
  it('a fala cortada não apaga a legenda da que a cortou', () => {
    const { captions, line } = mount()
    const first = captions.cueFor('Primeira.')
    const second = captions.cueFor('Segunda.')
    first.started()
    second.started()
    first.ended()
    expect(line.shown).toEqual(['Primeira.', 'Segunda.'])
    second.ended()
    expect(line.shown.at(-1)).toBeNull()
  })

  it('take sem texto não mostra caixa vazia', () => {
    const { captions, line } = mount()
    captions.cueFor('  ').started()
    expect(line.shown).toEqual([null])
  })

  it('desligada, apaga a que estiver na tela e não mostra as próximas', () => {
    const { captions, line } = mount()
    captions.cueFor('Arena ativa.').started()
    captions.setEnabled(false)
    captions.cueFor('Um minuto restante.').started()
    expect(line.shown).toEqual(['Arena ativa.', null, null])
  })

  it('religada no meio de uma fala, mostra a fala que está soando', () => {
    const { captions, line } = mount()
    captions.setEnabled(false)
    captions.setEnabled(false)
    captions.cueFor('Headshot.').started()
    captions.setEnabled(true)
    expect(line.shown).toEqual([null, null, 'Headshot.'])
  })
})
