import { describe, expect, it } from 'vitest'
import { createVoiceChat, type VoiceChain } from './webAudioVoiceChat.ts'

/** Uma corrente de nós em memória: guarda onde foi posta e se foi desligada. */
class FakeChain implements VoiceChain {
  readonly placed: { x: number; y: number; z: number }[] = []
  closed = false
  constructor(readonly track: MediaStreamTrack) {}
  place(audioM: { x: number; y: number; z: number }): void {
    this.placed.push({ ...audioM })
  }
  close(): void {
    this.closed = true
  }
}

/** O mixer, em memória: cada corrente aberta fica na lista. */
class FakeMixerOutput {
  readonly opened: FakeChain[] = []
  readonly open = (_out: 'saida', track: MediaStreamTrack): FakeChain => {
    const chain = new FakeChain(track)
    this.opened.push(chain)
    return chain
  }
}

const TRACK = { id: 'faixa-da-ana' } as MediaStreamTrack
const OTHER_TRACK = { id: 'outra-faixa-da-ana' } as MediaStreamTrack
const MOUTH = { x: 1, y: 1.7, z: 5 }

function mount(): { output: FakeMixerOutput; voices: ReturnType<typeof createVoiceChat<'saida'>> } {
  const output = new FakeMixerOutput()
  return { output, voices: createVoiceChat(output.open) }
}

describe('createVoiceChat', () => {
  it('abre a corrente na primeira vez que a boca é posta, e a reaproveita', () => {
    const { output, voices } = mount()
    voices.hear('ana', TRACK)
    voices.place('saida', 'ana', MOUTH)
    voices.place('saida', 'ana', MOUTH)
    expect(output.opened).toHaveLength(1)
    expect(output.opened[0]?.track).toBe(TRACK)
  })

  it('põe a voz no espaço da Web Audio, com o z trocado', () => {
    const { output, voices } = mount()
    voices.hear('ana', TRACK)
    voices.place('saida', 'ana', MOUTH)
    expect(output.opened[0]?.placed).toEqual([{ x: 1, y: 1.7, z: -5 }])
  })

  /** A voz que chega antes do `unlock` não se perde: soa quando o áudio ligar. */
  it('sem saída, guarda a faixa e abre a corrente quando a saída existir', () => {
    const { output, voices } = mount()
    voices.hear('ana', TRACK)
    voices.place(undefined, 'ana', MOUTH)
    expect(output.opened).toEqual([])
    voices.place('saida', 'ana', MOUTH)
    expect(output.opened).toHaveLength(1)
  })

  it('não abre corrente para quem não tem voz', () => {
    const { output, voices } = mount()
    voices.place('saida', 'bia', MOUTH)
    expect(output.opened).toEqual([])
  })

  it('a faixa nova troca a corrente, e a voz tirada desliga e some', () => {
    const { output, voices } = mount()
    voices.hear('ana', TRACK)
    voices.place('saida', 'ana', MOUTH)
    voices.hear('ana', OTHER_TRACK)
    voices.place('saida', 'ana', MOUTH)
    expect(output.opened.map((chain) => [chain.track, chain.closed])).toEqual([
      [TRACK, true],
      [OTHER_TRACK, false],
    ])
    voices.hear('ana', undefined)
    voices.place('saida', 'ana', MOUTH)
    expect(output.opened[1]?.closed).toBe(true)
    expect(output.opened).toHaveLength(2)
  })

  /** O contexto fechou com o mixer: a próxima saída monta tudo de novo. */
  it('esquece as correntes, e não as faixas, quando a saída fecha', () => {
    const { output, voices } = mount()
    voices.hear('ana', TRACK)
    voices.place('saida', 'ana', MOUTH)
    voices.forgetChains()
    voices.place('saida', 'ana', MOUTH)
    expect(output.opened).toHaveLength(2)
  })
})
