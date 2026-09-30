import type { LoadTask } from './loadProgress.ts'

/**
 * Os downloads que o boot espera antes de liberar a entrada, com o peso de
 * cada um em megabytes — o tamanho do arquivo servido, medido em 29/09. O peso
 * só decide quanto da barra cada um anda; se um arquivo crescer, a barra fica
 * um pouco torta, não errada: ela só chega a 100% quando todos terminaram.
 *
 * O que fica de fora é de propósito: os ícones de medalha descem depois do
 * controle (`main.ts`), e o áudio toca por streaming.
 */
export const ARENA_LOAD_TASKS: readonly LoadTask[] = [
  { name: 'cenario', weight: 4.8 },
  { name: 'lightmap', weight: 1.07 },
  { name: 'arma', weight: 1.39 },
  { name: 'competidor', weight: 0.97 },
]

export type ArenaLoadTaskName = 'cenario' | 'lightmap' | 'arma' | 'competidor'
