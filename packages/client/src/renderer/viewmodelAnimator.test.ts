import { describe, expect, it } from 'vitest'
import { IDLE_FRAME, VIEWMODEL_SEGMENTS } from '../character/viewmodelClips.ts'
import { type ClipPlayer, createViewmodelAnimator, freezeAtFrame } from './viewmodelAnimator.ts'

/** Grupo de animação de mentira: anota tudo que mandaram ele fazer, em ordem. */
class FakeClipPlayer implements ClipPlayer {
  readonly calls: string[] = []
  stop(): void {
    this.calls.push('stop')
  }
  start(loop: boolean, speedRatio: number, from: number, to: number): void {
    this.calls.push(`start(${loop}, ${speedRatio.toFixed(2)}, ${from}, ${to})`)
  }
  goToFrame(frame: number): void {
    this.calls.push(`goToFrame(${frame})`)
  }
  pause(): void {
    this.calls.push('pause')
  }
}

const TEMPO = { boltCycleS: 1.3, reloadS: 2.4 }

describe('freezeAtFrame', () => {
  /** `goToFrame` é ignorado num grupo parado: o `start` antes é obrigatório. */
  it('inicia o grupo antes de posicionar e pausa depois', () => {
    const group = new FakeClipPlayer()
    freezeAtFrame(group, 120)
    expect(group.calls).toEqual(['stop', 'start(true, 1.00, 120, 121)', 'goToFrame(120)', 'pause'])
  })
})

describe('createViewmodelAnimator', () => {
  it('nasce congelado na pose parada', () => {
    const group = new FakeClipPlayer()
    createViewmodelAnimator(group, TEMPO)
    expect(group.calls).toContain(`goToFrame(${IDLE_FRAME})`)
    expect(group.calls.at(-1)).toBe('pause')
  })

  it('toca o disparo uma vez, no intervalo medido', () => {
    const group = new FakeClipPlayer()
    const animator = createViewmodelAnimator(group, TEMPO)
    group.calls.length = 0
    animator.play('shoot')
    const { fromFrame, toFrame } = VIEWMODEL_SEGMENTS.shoot
    expect(group.calls).toEqual(['stop', `start(false, 1.00, ${fromFrame}, ${toFrame})`])
  })

  it('encaixa o ferrolho no ciclo que a configuração manda', () => {
    const group = new FakeClipPlayer()
    const animator = createViewmodelAnimator(group, TEMPO)
    group.calls.length = 0
    animator.play('bolt')
    expect(group.calls[1]).toBe('start(false, 1.23, 24, 120)')
  })

  /** Reiniciar o clipe que já está tocando é o tique que trava a arma no primeiro quadro. */
  it('não reinicia o clipe que já está tocando', () => {
    const group = new FakeClipPlayer()
    const animator = createViewmodelAnimator(group, TEMPO)
    animator.play('bolt')
    group.calls.length = 0
    animator.play('bolt')
    animator.play('bolt')
    expect(group.calls).toEqual([])
  })

  it('voltar à pose parada congela de novo', () => {
    const group = new FakeClipPlayer()
    const animator = createViewmodelAnimator(group, TEMPO)
    animator.play('shoot')
    group.calls.length = 0
    animator.play(undefined)
    expect(group.calls).toEqual([
      'stop',
      `start(true, 1.00, ${IDLE_FRAME}, ${IDLE_FRAME + 1})`,
      `goToFrame(${IDLE_FRAME})`,
      'pause',
    ])
  })

  it('a sequência tiro, ferrolho e descanso toca os três em ordem', () => {
    const group = new FakeClipPlayer()
    const animator = createViewmodelAnimator(group, TEMPO)
    group.calls.length = 0
    animator.play('shoot')
    animator.play('bolt')
    animator.play(undefined)
    const started = group.calls.filter((call) => call.startsWith('start'))
    expect(started).toEqual([
      'start(false, 1.00, 0, 24)',
      'start(false, 1.23, 24, 120)',
      `start(true, 1.00, ${IDLE_FRAME}, ${IDLE_FRAME + 1})`,
    ])
  })
})
