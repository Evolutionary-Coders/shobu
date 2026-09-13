import { pushTarget, resetTargetList, type TargetList } from '../collision/targetList.ts'
import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { Vector3 } from '../math/vector3.ts'

/**
 * Um alvo parado no campo de treino: mesma cápsula do jogador, mesmo caminho de
 * acerto, mesmo evento de kill. Ele não anda e não atira — é o jogador remoto
 * com tudo removido menos o que a resolução de acerto lê, e por isso o código
 * que o mata é o mesmo que vai matar um jogador do colyseus.
 *
 * Existe porque hoje não há servidor nem oponente, e sem alvo não há como
 * provar que o tiro, a kill e o placar funcionam.
 */
export interface TrainingDummy {
  readonly id: string
  /** O pé, em metros. Constante: o boneco não se move. */
  readonly feetM: Readonly<Vector3>
  alive: boolean
  respawnLeftS: number
}

export function createTrainingDummy(id: string, feetM: Readonly<Vector3>): TrainingDummy {
  return { id, feetM: { ...feetM }, alive: true, respawnLeftS: 0 }
}

/**
 * Um tick: só o cronômetro. Ressuscita no tick em que ele zera.
 *
 * Não recebe o atraso de respawn: quem o arma é `killTrainingDummy`, e passá-lo
 * aqui deixaria o mesmo número em dois lugares, por tick.
 */
export function stepTrainingDummy(dummy: TrainingDummy, dtS: number): void {
  if (dummy.alive) return
  dummy.respawnLeftS = Math.max(0, dummy.respawnLeftS - dtS)
  if (dummy.respawnLeftS > 0) return
  dummy.alive = true
}

/** Mata e arma o respawn. Matar quem já está morto não reinicia o cronômetro. */
export function killTrainingDummy(dummy: TrainingDummy, respawnDelayS: number): void {
  if (!dummy.alive) return
  dummy.alive = false
  dummy.respawnLeftS = respawnDelayS
}

/**
 * Enfileira os bonecos vivos como alvos do próximo tiro. Morto não é
 * atingível: o tiro passa por onde ele estava.
 *
 * A cápsula é a **da configuração de colisão** — a mesma contra a qual o sweep
 * colide. Silhueta maior que hitbox é tiro que acerta na tela e não conta.
 *
 * ```ts
 * resolveShot(shot, world, collectLiveTargets(dummies, config, targets), rng, hit)
 * ```
 */
export function collectLiveTargets(
  dummies: readonly TrainingDummy[],
  config: GameplayConfig,
  into: TargetList,
): TargetList {
  resetTargetList(into)
  const { capsuleRadiusM, capsuleHeightM } = config.collision
  for (let index = 0; index < dummies.length; index += 1) {
    const dummy = dummies[index]
    if (!dummy?.alive) continue
    pushTarget(into, index, dummy.feetM, capsuleRadiusM, capsuleHeightM)
  }
  return into
}
