/**
 * Promessas encadeadas: cada tarefa começa quando a anterior termina, com erro
 * ou não. É a fila única do matchmaking (`matchmaking.ts`): reservar assento é
 * assíncrono, e duas entradas ao mesmo tempo veriam a mesma vaga.
 *
 * ```ts
 * const serial = createSerialQueue()
 * const offer = await serial.run(() => routeRoomEntry(directory, source, request, wanted))
 * ```
 */
export interface SerialQueue {
  run<T>(task: () => Promise<T>): Promise<T>
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    run: (task) => {
      const next = tail.then(task)
      tail = next.catch(() => undefined)
      return next
    },
  }
}
