import { describe, expect, it } from 'vitest'
import { createLoopTrack, type LoopPlayer, switchLoop } from './loopSwitch.ts'

/** Uma fonte do motor falso: o som e a velocidade com que começou, e se parou. */
interface FakeLoopSource {
  readonly url: string
  readonly rate: number
  stopped: boolean
}

/**
 * O motor de áudio falso: o download só termina quando o teste manda, que é
 * como a ordem de chegada dos downloads fica nas mãos do teste.
 */
class FakeLoopPlayer implements LoopPlayer<string, FakeLoopSource> {
  readonly started: FakeLoopSource[] = []
  private readonly pending: Array<() => void> = []

  bufferOf(url: string): Promise<string> {
    return new Promise((resolve) => this.pending.push(() => resolve(url)))
  }

  start(buffer: string, rate: number): FakeLoopSource {
    const source = { url: buffer, rate, stopped: false }
    this.started.push(source)
    return source
  }

  stop(source: FakeLoopSource): void {
    source.stopped = true
  }

  /** Termina todo download pendente, na ordem do pedido. */
  async finishDownloads(): Promise<void> {
    for (const finish of this.pending.splice(0)) finish()
    await Promise.resolve()
  }

  playing(): FakeLoopSource[] {
    return this.started.filter((source) => !source.stopped)
  }
}

describe('switchLoop', () => {
  it('começa o laço pedido quando o download chega', async () => {
    const player = new FakeLoopPlayer()
    const track = createLoopTrack<FakeLoopSource>()
    const switching = switchLoop(track, 'passo', 1.2, player)
    await player.finishDownloads()
    await switching
    expect(player.playing()).toEqual([{ url: 'passo', rate: 1.2, stopped: false }])
  })

  it('trocar para outro som para o laço que tocava', async () => {
    const player = new FakeLoopPlayer()
    const track = createLoopTrack<FakeLoopSource>()
    const first = switchLoop(track, 'passo', 1, player)
    await player.finishDownloads()
    await first
    const second = switchLoop(track, 'corrida', 1, player)
    await player.finishDownloads()
    await second
    expect(player.playing().map((source) => source.url)).toEqual(['corrida'])
  })

  it('a troca pedida durante o download vence a anterior', async () => {
    const player = new FakeLoopPlayer()
    const track = createLoopTrack<FakeLoopSource>()
    const switches = [
      switchLoop(track, 'passo', 1, player),
      switchLoop(track, 'corrida', 1, player),
    ]
    await player.finishDownloads()
    await Promise.all(switches)
    expect(player.started.map((source) => source.url)).toEqual(['corrida'])
  })

  it('pedir silêncio para o laço e não começa nada', async () => {
    const player = new FakeLoopPlayer()
    const track = createLoopTrack<FakeLoopSource>()
    const first = switchLoop(track, 'passo', 1, player)
    await player.finishDownloads()
    await first
    await switchLoop(track, undefined, 1, player)
    expect(player.playing()).toEqual([])
  })

  it('A→B→A durante o download deixa um laço só tocando', async () => {
    // regressão: os dois pedidos de A passavam pela comparação da url, e a
    // primeira fonte ficava em laço para sempre (revisão do PR #31).
    const player = new FakeLoopPlayer()
    const track = createLoopTrack<FakeLoopSource>()
    const switches = [
      switchLoop(track, 'passo', 1, player),
      switchLoop(track, 'corrida', 1, player),
      switchLoop(track, 'passo', 1, player),
    ]
    await player.finishDownloads()
    await Promise.all(switches)
    expect(player.started).toHaveLength(1)
    expect(track.source).toBe(player.started[0])
  })

  it('A→silêncio→A durante o download deixa um laço só tocando', async () => {
    const player = new FakeLoopPlayer()
    const track = createLoopTrack<FakeLoopSource>()
    const switches = [
      switchLoop(track, 'passo', 1, player),
      switchLoop(track, undefined, 1, player),
      switchLoop(track, 'passo', 1, player),
    ]
    await player.finishDownloads()
    await Promise.all(switches)
    expect(player.started).toHaveLength(1)
  })
})
