import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import type { Skeleton } from '@babylonjs/core/Bones/skeleton'
import type { ClipSelection, ThirdPersonClip } from '../character/thirdPersonClips.ts'

/**
 * Toca no babylon o clipe que `thirdPersonClips.ts` escolheu. É o adapter da
 * metade TPP: recebe a seleção por quadro e só mexe na engine quando ela muda.
 *
 * A troca é um **crossfade por peso**, não o `enableBlending` do babylon: o
 * blend nativo refaz a interpolação a cada volta do loop, e o corpo dava um
 * solavanco por ciclo de corrida. Com peso, os dois grupos tocam juntos por
 * `CROSSFADE_S` e o que sai é parado no fim.
 *
 * E os clipes do SWAT animam **conjuntos diferentes de ossos** (o `Run` tem 54
 * canais, o `Idle_Gun` 35): trocar de um para o outro deixava as pernas
 * congeladas na última pose da corrida enquanto o quadril ia para a pose de
 * idle, e a malha esticava entre os dois. No fim de cada crossfade, todo osso
 * que o clipe novo **não** anima volta ao repouso.
 *
 * ```ts
 * const animator = createCompetitorAnimator(loaded.animationGroups, loaded.skeletons)
 * animator.play({ clip: 'CharacterArmature|Run', loop: true, speedRatio: 1.33 }, frameS)
 * ```
 */
export interface CompetitorAnimator {
  /** Chame a cada quadro: além de trocar o clipe, é o que avança o crossfade. */
  play(selection: ClipSelection, frameS: number): void
}

/** Curto o bastante para não parecer atraso de rede, longo o bastante para não estalar. */
const CROSSFADE_S = 0.18

export function createCompetitorAnimator(
  groups: readonly AnimationGroup[],
  skeletons: readonly Skeleton[],
): CompetitorAnimator {
  const byName = indexByName(groups)
  const fade = {
    current: undefined as AnimationGroup | undefined,
    outgoing: undefined as AnimationGroup | undefined,
    progress: 1,
  }
  return {
    play: (selection, frameS) => {
      const next = requireGroup(byName, selection.clip)
      if (next !== fade.current) beginCrossfade(fade, next, selection)
      else next.speedRatio = selection.speedRatio
      advanceCrossfade(fade, frameS, skeletons)
    },
  }
}

interface Crossfade {
  current: AnimationGroup | undefined
  outgoing: AnimationGroup | undefined
  /** 0 no começo da troca, 1 quando só o atual toca. */
  progress: number
}

function beginCrossfade(fade: Crossfade, next: AnimationGroup, selection: ClipSelection): void {
  // uma troca no meio de outra descarta a que estava saindo: três grupos com
  // peso ao mesmo tempo é o que faz braço passar por dentro de tronco.
  fade.outgoing?.stop()
  fade.outgoing = fade.current
  fade.current = next
  fade.progress = fade.outgoing ? 0 : 1
  next.start(selection.loop, selection.speedRatio)
  next.setWeightForAllAnimatables(fade.progress)
}

function advanceCrossfade(fade: Crossfade, frameS: number, skeletons: readonly Skeleton[]): void {
  if (!fade.current || fade.progress >= 1) return
  fade.progress = Math.min(1, fade.progress + frameS / CROSSFADE_S)
  fade.current.setWeightForAllAnimatables(fade.progress)
  fade.outgoing?.setWeightForAllAnimatables(1 - fade.progress)
  if (fade.progress < 1) return
  fade.outgoing?.stop()
  fade.outgoing = undefined
  restUntargetedBones(fade.current, skeletons)
}

/**
 * Osso que o clipe atual não anima fica com o valor que o clipe anterior
 * deixou — para sempre, porque ninguém mais escreve nele. Voltar ao repouso é
 * o que impede a perna congelada na pose de corrida debaixo de um tronco em idle.
 */
function restUntargetedBones(group: AnimationGroup, skeletons: readonly Skeleton[]): void {
  const targeted = new Set(group.targetedAnimations.map((entry) => entry.target))
  for (const skeleton of skeletons) {
    for (const bone of skeleton.bones) {
      const node = bone.getTransformNode()
      if (node && !targeted.has(node)) bone.returnToRest()
    }
  }
}

function indexByName(groups: readonly AnimationGroup[]): ReadonlyMap<string, AnimationGroup> {
  const byName = new Map<string, AnimationGroup>()
  for (const group of groups) {
    // o loader do glTF começa a tocar o primeiro grupo sozinho; aqui manda o quê.
    group.stop()
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
