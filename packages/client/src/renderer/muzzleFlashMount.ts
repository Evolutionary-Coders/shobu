/**
 * Onde o clarão do cano do jogador acende. Sem engine: a malha e o rig entram
 * pelo formato, e o teste roda em node (ADR 0001).
 *
 * O clarão é filho do rig da arma, e o rig só existe quando o glb chega. Antes
 * disso o clarão não tinha pai, e um tiro — ou o aquecimento dos shaders —
 * acendia ele na origem do mundo (revisão do PR #30).
 */
export interface MountableFlash {
  readonly mesh: {
    parent: object | null
    readonly position: { set(x: number, y: number, z: number): unknown }
  }
  fire(): void
}

/** A boca do cano no espaço de quem segura o clarão. */
export type MuzzleOffsetM = readonly [number, number, number]

/**
 * O clarão de um tiro: na boca do cano, preso ao rig. Sem arma na mão ainda,
 * não acende — não há cano de onde sair. Devolve se acendeu.
 *
 * ```ts
 * fireFlashOnRig(flash, viewmodel?.rig, SNIPER_MUZZLE_M)
 * ```
 */
export function fireFlashOnRig(
  flash: MountableFlash,
  rig: object | undefined,
  muzzleM: MuzzleOffsetM,
): boolean {
  if (!rig) return false
  mountFlash(flash, rig, muzzleM)
  flash.fire()
  return true
}

/**
 * O clarão do aquecimento: no rig, se a arma já chegou; senão no olho, no
 * mesmo deslocamento, onde a tela do menu o esconde. Acende sempre — é o
 * desenho que sobe o programa do clarão para a gpu —, e o primeiro tiro com a
 * arma na mão o leva para o rig.
 *
 * ```ts
 * warmUpFlash(flash, viewmodel?.rig, camera, SNIPER_MUZZLE_M)
 * ```
 */
export function warmUpFlash(
  flash: MountableFlash,
  rig: object | undefined,
  eye: object,
  muzzleM: MuzzleOffsetM,
): void {
  mountFlash(flash, rig ?? eye, muzzleM)
  flash.fire()
}

/** Troca de pai só na mudança: o clarão fica no rig de uma vez por todas. */
function mountFlash(flash: MountableFlash, holder: object, muzzleM: MuzzleOffsetM): void {
  if (flash.mesh.parent === holder) return
  flash.mesh.parent = holder
  flash.mesh.position.set(...muzzleM)
}
