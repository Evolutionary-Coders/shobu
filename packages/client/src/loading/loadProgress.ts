/**
 * O quanto do jogo já foi baixado, de 0 a 1 — e não o quanto da intro já foi
 * impressa.
 *
 * A barra do boot contava só as linhas do texto: chegava a 100% com o glb da
 * arena, de 4,8 MB, ainda descendo, e o jogador entrava no greybox e via a
 * cidade pipocar depois (29/09). Aqui cada download pesado informa a própria
 * fração, e o total é a média pesada pelo tamanho de cada um.
 *
 * Dado puro, sem engine nem dom: quem informa é o renderer, quem desenha é o
 * overlay do boot.
 */

export interface LoadTask {
  readonly name: string
  /** O peso do download no total. Proporcional aos bytes, não precisa somar 1. */
  readonly weight: number
}

export interface LoadProgress {
  /** A fração de uma tarefa. Nunca volta: download que recomeça não desfaz a barra. */
  report(name: string, fraction: number): void
  /** A tarefa terminou — baixou, ou falhou e o jogo segue sem ela. */
  finish(name: string): void
  ratio(): number
  isComplete(): boolean
  /**
   * Quem desenha a barra: chamado agora, com o estado atual, e a cada fração
   * nova. Quem se inscreve tarde não perde o que já aconteceu.
   */
  onChange(listener: LoadListener): void
}

export type LoadListener = (ratio: number, complete: boolean) => void

/**
 * ```ts
 * const progress = createLoadProgress([{ name: 'arena', weight: 4.8 }])
 * progress.report('arena', 0.5)
 * progress.ratio() // 0.5
 * ```
 */
export function createLoadProgress(tasks: readonly LoadTask[]): LoadProgress {
  if (tasks.length === 0) {
    throw new RangeError('createLoadProgress recebeu []; esperado ao menos uma tarefa')
  }
  const state: LoadState = {
    slots: new Map(tasks.map((task) => [task.name, { fraction: 0, weight: positiveWeight(task) }])),
    total: tasks.reduce((sum, task) => sum + task.weight, 0),
    listeners: [],
  }
  return {
    report: (name, fraction) => report(state, name, fraction),
    finish: (name) => report(state, name, 1),
    ratio: () => ratioOf(state),
    isComplete: () => completeOf(state),
    onChange: (listener) => {
      state.listeners.push(listener)
      listener(ratioOf(state), completeOf(state))
    },
  }
}

interface LoadSlot {
  fraction: number
  readonly weight: number
}

interface LoadState {
  readonly slots: ReadonlyMap<string, LoadSlot>
  readonly total: number
  readonly listeners: LoadListener[]
}

function report(state: LoadState, name: string, fraction: number): void {
  const slot = requireSlot(state.slots, name)
  const next = Math.max(slot.fraction, clampFraction(fraction))
  if (next === slot.fraction) return
  slot.fraction = next
  for (const listener of state.listeners) listener(ratioOf(state), completeOf(state))
}

function ratioOf(state: LoadState): number {
  let done = 0
  for (const slot of state.slots.values()) done += slot.fraction * slot.weight
  return done / state.total
}

function completeOf(state: LoadState): boolean {
  return [...state.slots.values()].every((slot) => slot.fraction >= 1)
}

/**
 * O que a barra do boot mostra: o menor entre a intro impressa e o jogo
 * baixado. Ela só chega a 100% quando **as duas** chegaram — texto que acabou
 * antes do download espera, e download que acabou antes do texto também.
 *
 * ```ts
 * bootBarRatio(1, 0.4) // 0.4
 * ```
 */
export function bootBarRatio(printedRatio: number, loadedRatio: number): number {
  return Math.min(clampFraction(printedRatio), clampFraction(loadedRatio))
}

function requireSlot(slots: ReadonlyMap<string, LoadSlot>, name: string): LoadSlot {
  const slot = slots.get(name)
  if (slot) return slot
  throw new RangeError(
    `tarefa de carga ${name} desconhecida; esperado uma de ${[...slots.keys()].join(', ')}`,
  )
}

function positiveWeight(task: LoadTask): number {
  if (task.weight > 0) return task.weight
  throw new RangeError(`tarefa ${task.name} recebeu peso ${task.weight}; esperado número > 0`)
}

function clampFraction(fraction: number): number {
  if (Number.isNaN(fraction)) return 0
  return Math.min(1, Math.max(0, fraction))
}

/** O pedaço do evento de progresso do carregador do babylon que interessa aqui. */
export interface DownloadEvent {
  readonly lengthComputable: boolean
  readonly loaded: number
  readonly total: number
}

/**
 * A fração de um download, ou `null` quando o servidor não informou o tamanho:
 * sem `Content-Length` não há fração honesta, e a tarefa só anda quando termina.
 *
 * ```ts
 * downloadFraction({ lengthComputable: true, loaded: 5, total: 10 }) // 0.5
 * ```
 */
export function downloadFraction(event: DownloadEvent): number | null {
  if (!event.lengthComputable || event.total <= 0) return null
  return event.loaded / event.total
}

export interface BootBar {
  printed(ratio: number): void
  loaded(ratio: number): void
}

/**
 * A barra do boot alimentada pelas duas pontas: o texto da intro e o download.
 * Cada lado informa o seu; ela sempre desenha `bootBarRatio` dos dois.
 *
 * ```ts
 * const bar = createBootBar(overlay.setProgress)
 * bar.printed(1)
 * bar.loaded(0.4) // desenha 0.4
 * ```
 */
export function createBootBar(draw: (ratio: number) => void): BootBar {
  const state = { printed: 0, loaded: 0 }
  const redraw = (): void => draw(bootBarRatio(state.printed, state.loaded))
  return {
    printed: (ratio) => {
      state.printed = ratio
      redraw()
    },
    loaded: (ratio) => {
      state.loaded = ratio
      redraw()
    },
  }
}
