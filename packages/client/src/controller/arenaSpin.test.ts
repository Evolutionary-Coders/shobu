import { describe, expect, it } from 'vitest'
import { BOT_POST, FRAME_S, mountSession, type Rig } from './arenaSessionTestKit.ts'

/** A mira no rumo `deg`, girando de +z para +x. Trigonometria só no teste. */
function aimTurnedBy(deg: number): { x: number; y: number; z: number } {
  const rad = (deg * Math.PI) / 180
  return { x: Math.sin(rad), y: 0, z: Math.cos(rad) }
}

/** Colado no bot, onde o tiro sem luneta acerta sem depender do cone. */
function nextToTheBot(): Rig {
  return mountSession(undefined, { startFeetM: { ...BOT_POST, z: BOT_POST.z - 1.5 } })
}

/** Uma volta inteira em `frames` quadros, terminando de frente para o bot. */
function spinOnce(rig: Rig, frames: number): void {
  for (let frame = 0; frame <= frames; frame += 1) {
    rig.frame({ aimM: aimTurnedBy((360 * frame) / frames) })
  }
}

/**
 * O tiro no peito do bot, de cima: no ar o olho passa da cabeça dele, e o
 * cone sem luneta joga o raio para fora da cápsula. Devolve as medalhas do
 * quadro do tiro, copiadas, como o `pullTriggerForMedals`.
 */
function fireAtChest(rig: Rig): readonly string[] {
  rig.weaponInput.fire = true
  rig.frame({ aimM: { x: 0, y: -0.6, z: 0.8 } })
  const slugs = rig.session.lastMedals.map((award) => award.medal.slug)
  rig.weaponInput.fire = false
  return slugs
}

/** Pula e espera o corpo sair do chão. */
function jump(rig: Rig): void {
  rig.movementInput.jump = true
  rig.frame()
  rig.movementInput.jump = false
  rig.frame()
}

describe('o 360-no-scope, offline', () => {
  it('a volta inteira no ar, sem luneta, é a lendária', () => {
    const rig = nextToTheBot()
    spinOnce(rig, 30)
    jump(rig)
    expect(fireAtChest(rig)).toContain('360-no-scope')
  })

  it('a mesma volta, mais velha que a janela, não conta', () => {
    const rig = nextToTheBot()
    spinOnce(rig, 30)
    const settleFrames = Math.ceil(2.5 / FRAME_S)
    for (let frame = 0; frame < settleFrames; frame += 1) rig.frame()
    jump(rig)
    expect(fireAtChest(rig)).not.toContain('360-no-scope')
  })
})
