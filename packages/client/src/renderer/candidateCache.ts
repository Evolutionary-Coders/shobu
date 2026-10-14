/**
 * A lista de candidatos a desenho de uma câmera, filtrada e guardada: refazer
 * o filtro sobre ~1900 malhas a cada quadro seria o custo que a lista existe
 * para evitar.
 *
 * Refaz quando o tamanho da cena muda **ou** quando alguém invalida. Só o
 * tamanho não basta: o loader do glTF põe as malhas na cena antes de quem
 * carregou trocar a camada delas, e a lista guardada nesse meio-tempo ficava
 * sem a arma para sempre (revisão do PR #23).
 *
 * Dado puro: a forma `{ data, length }` é a que o babylon pede em
 * `getActiveMeshCandidates`.
 *
 * ```ts
 * const cache = createCandidateCache((mesh: AbstractMesh) => (mesh.layerMask & VIEWMODEL_LAYER) !== 0)
 * scene.getActiveMeshCandidates = () => cache.list(scene.meshes)
 * ```
 */
export interface CandidateList<T> {
  data: T[]
  length: number
}

export interface CandidateCache<T> {
  list(all: readonly T[]): CandidateList<T>
  /** A filiação mudou sem a cena mudar de tamanho: a próxima leitura refaz. */
  invalidate(): void
}

export function createCandidateCache<T>(isMember: (item: T) => boolean): CandidateCache<T> {
  const cached: CandidateList<T> = { data: [], length: 0 }
  const state = { sourceLength: -1, dirty: true }
  return {
    list: (all) => {
      if (!state.dirty && state.sourceLength === all.length) return cached
      cached.data = all.filter(isMember)
      cached.length = cached.data.length
      state.sourceLength = all.length
      state.dirty = false
      return cached
    },
    invalidate: () => {
      state.dirty = true
    },
  }
}
