import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import type { ClipSelection, ThirdPersonClip } from '../character/thirdPersonClips.ts'

/**
 * Toca no babylon o clipe que `thirdPersonClips.ts` escolheu. É o adapter da
 * metade TPP: recebe a seleção por quadro e só mexe na engine quando ela muda
 * — trocar de grupo a cada quadro reiniciaria o clipe e o corpo tremeria.
 *
 * A troca é com **blend**: o babylon interpola do último quadro do clipe que
 * sai para o primeiro do que entra, então parar de correr não faz o corpo
 * pular para a pose de idle.
 *
 * ```ts
 * const animator = createCompetitorAnimator(loaded.animationGroups)
 * animator.play({ clip: 'CharacterArmature|Run', loop: true, speedRatio: 1.33 })
 * ```
 */
export interface CompetitorAnimator {
  play(selection: ClipSelection): void
}

/**
 * Quanto do caminho até a pose nova cada quadro percorre. 0,15 fecha a troca
 * em uns dez quadros, curto o bastante para não parecer atraso de rede.
 */
const BLENDING_SPEED = 0.15

export function createCompetitorAnimator(groups: readonly AnimationGroup[]): CompetitorAnimator {
  const byName = indexByName(groups)
  let current: AnimationGroup | undefined
  return {
    play: (selection) => {
      const next = requireGroup(byName, selection.clip)
      if (next === current) {
        next.speedRatio = selection.speedRatio
        return
      }
      current?.stop()
      next.start(selection.loop, selection.speedRatio)
      current = next
    },
  }
}

function indexByName(groups: readonly AnimationGroup[]): ReadonlyMap<string, AnimationGroup> {
  const byName = new Map<string, AnimationGroup>()
  for (const group of groups) {
    // o loader do glTF começa a tocar o primeiro grupo sozinho; aqui manda o quê.
    group.stop()
    group.enableBlending = true
    group.blendingSpeed = BLENDING_SPEED
    byName.set(group.name, group)
  }
  return byName
}

function requireGroup(
  byName: ReadonlyMap<string, AnimationGroup>,
  clip: ThirdPersonClip,
): AnimationGroup {
  const group = byName.get(clip)
  if (group) return group
  const names = [...byName.keys()].join(', ')
  throw new Error(`o glb não tem o grupo '${clip}'; tem [${names}]`)
}
