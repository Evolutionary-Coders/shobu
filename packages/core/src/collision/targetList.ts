import type { Vector3 } from '../math/vector3.ts'
import type { PlayerBox } from './staticBox.ts'

type MutablePlayerBox = { -readonly [Key in keyof PlayerBox]: PlayerBox[Key] }

/**
 * Os alvos de um disparo, em caixas reaproveitadas. Só as `count` primeiras
 * entradas valem; o resto é lixo do tick anterior, de propósito — encher a
 * lista é o caminho quente, e alocar caixa por tiro é o que o nfr.md proíbe.
 *
 * `sourceIndex[i]` diz quem originou `boxes[i]`. Hoje é um boneco de treino;
 * amanhã é um jogador da sala (ADR 0002). **É este indireto que faz o código de
 * acerto e de kill não mudar quando o colyseus entrar**: `resolveShot` e
 * `applyKill` nunca souberam a diferença entre os dois.
 */
export interface TargetList {
  readonly boxes: readonly MutablePlayerBox[]
  readonly sourceIndex: number[]
  count: number
}

export function createTargetList(capacity: number): TargetList {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError(`capacity recebeu ${capacity}; esperado inteiro >= 1`)
  }
  return {
    boxes: Array.from({ length: capacity }, () => ({
      feetX: 0,
      feetY: 0,
      feetZ: 0,
      radiusM: 0,
      heightM: 0,
    })),
    sourceIndex: new Array<number>(capacity).fill(-1),
    count: 0,
  }
}

/** Zera a contagem e devolve a lista, para o chamador preencher. */
export function resetTargetList(list: TargetList): TargetList {
  list.count = 0
  return list
}

/**
 * Escreve um alvo no fim da lista.
 *
 * ```ts
 * pushTarget(resetTargetList(list), dummyIndex, dummy.feetM, radiusM, heightM)
 * ```
 */
export function pushTarget(
  list: TargetList,
  sourceIndex: number,
  feetM: Readonly<Vector3>,
  radiusM: number,
  heightM: number,
): void {
  const box = list.boxes[list.count]
  if (!box) {
    throw new RangeError(
      `a lista de alvos recebeu o alvo ${list.count + 1}; esperado no máximo ${list.boxes.length}`,
    )
  }
  box.feetX = feetM.x
  box.feetY = feetM.y
  box.feetZ = feetM.z
  box.radiusM = radiusM
  box.heightM = heightM
  list.sourceIndex[list.count] = sourceIndex
  list.count += 1
}
