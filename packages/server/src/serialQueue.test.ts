import { describe, expect, it } from 'vitest'
import { createSerialQueue } from './serialQueue.ts'

describe('createSerialQueue', () => {
  it('começa cada tarefa só depois que a anterior termina', async () => {
    const serial = createSerialQueue()
    const order: string[] = []
    let release: () => void = () => undefined
    const first = serial.run(
      () =>
        new Promise<string>((resolve) => {
          order.push('primeira começou')
          release = () => resolve('a')
        }),
    )
    const second = serial.run(async () => {
      order.push('segunda começou')
      return 'b'
    })
    await Promise.resolve()
    expect(order).toEqual(['primeira começou'])
    release()
    expect(await Promise.all([first, second])).toEqual(['a', 'b'])
    expect(order).toEqual(['primeira começou', 'segunda começou'])
  })

  /** Uma entrada que falhou não pode travar a fila do servidor inteiro. */
  it('segue para a próxima depois de uma tarefa que falhou, e devolve o erro a quem pediu', async () => {
    const serial = createSerialQueue()
    const failed = serial.run(() => Promise.reject(new Error('sala fechando')))
    const next = serial.run(async () => 'seguiu')
    await expect(failed).rejects.toThrow('sala fechando')
    expect(await next).toBe('seguiu')
  })
})
