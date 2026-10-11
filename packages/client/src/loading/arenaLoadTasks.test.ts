import { describe, expect, it } from 'vitest'
import { ARENA_LOAD_TASKS } from './arenaLoadTasks.ts'
import { createLoadProgress } from './loadProgress.ts'

describe('ARENA_LOAD_TASKS', () => {
  it('dá nome único a cada download', () => {
    const names = ARENA_LOAD_TASKS.map((task) => task.name)
    expect(new Set(names).size).toBe(names.length)
  })

  /** A arte da arena é o download mais pesado, e é ela que a barra existe para esperar. */
  it('pesa a arte da arena mais que tudo o resto', () => {
    const [scenery, ...rest] = ARENA_LOAD_TASKS
    for (const task of rest) expect(scenery?.weight ?? 0).toBeGreaterThan(task.weight)
  })

  it('monta um progresso válido', () => {
    expect(createLoadProgress(ARENA_LOAD_TASKS).ratio()).toBe(0)
  })
})
