import { describe, expect, it } from 'vitest'
import {
  advanceRecoil,
  createWeaponRecoil,
  kickRecoil,
  type RecoilOffset,
  residualKickRad,
  type WeaponRecoil,
} from './weaponRecoil.ts'

const FRAME_S = 1 / 60

function emptyOffset(): RecoilOffset {
  return { pitchDeltaRad: 0, rollRad: 0 }
}

/** Soma as diferenças de inclinação, que é o que a câmera acumula de fato. */
function settle(recoil: WeaponRecoil, seconds: number): number {
  const out = emptyOffset()
  let pitch = 0
  for (let frame = 0; frame < Math.ceil(seconds / FRAME_S); frame += 1) {
    advanceRecoil(recoil, FRAME_S, out)
    pitch += out.pitchDeltaRad
  }
  return pitch
}

describe('kickRecoil', () => {
  /** Negativo é para cima, na convenção do babylon. */
  it('o tiro levanta a mira no quadro seguinte', () => {
    const recoil = createWeaponRecoil(true)
    kickRecoil(recoil)
    const out = emptyOffset()
    advanceRecoil(recoil, FRAME_S, out)
    expect(out.pitchDeltaRad).toBeLessThan(0)
  })

  it('a subida inteira sai em poucos quadros', () => {
    const recoil = createWeaponRecoil(true)
    kickRecoil(recoil)
    expect(settle(recoil, 0.05)).toBeLessThan(-residualKickRad())
  })

  /** O que fica é o custo do tiro: quem atira em sequência corrige para baixo. */
  it('a mira volta quase toda, e o resto fica', () => {
    const recoil = createWeaponRecoil(true)
    kickRecoil(recoil)
    expect(settle(recoil, 2)).toBeCloseTo(-residualKickRad(), 3)
  })

  it('dois tiros seguidos levantam mais que um', () => {
    const single = createWeaponRecoil(true)
    kickRecoil(single)
    const double = createWeaponRecoil(true)
    kickRecoil(double)
    kickRecoil(double)
    expect(settle(double, 2)).toBeLessThan(settle(single, 2))
  })

  it('sem tiro nenhum a câmera fica parada', () => {
    expect(settle(createWeaponRecoil(true), 1)).toBe(0)
  })
})

/**
 * A força do coice é número de sensação, e sensação não tem teste que a prove.
 * O que estes prendem é a **ordem de grandeza**: mexer nela passa a ser
 * decisão, e não efeito colateral de mexer no tempo da subida ou na fração que
 * volta.
 */
describe('a força do coice', () => {
  const toDeg = (rad: number): number => (rad * 180) / Math.PI

  it('o pico tira o alvo de vista: mais de sete graus', () => {
    const recoil = createWeaponRecoil(true)
    kickRecoil(recoil)
    expect(toDeg(-settle(recoil, 0.05))).toBeGreaterThan(7)
  })

  it('e não chega a cegar: menos de quatorze graus', () => {
    const recoil = createWeaponRecoil(true)
    kickRecoil(recoil)
    expect(toDeg(-settle(recoil, 0.05))).toBeLessThan(14)
  })

  /** O que sobra é o que o jogador corrige entre tiros. */
  it('o que fica para corrigir é pouco mais de um grau', () => {
    expect(toDeg(residualKickRad())).toBeGreaterThan(1)
    expect(toDeg(residualKickRad())).toBeLessThan(2.5)
  })

  /**
   * Quem conta a história do coice é o cano subindo, não a tela vibrando:
   * tremor grande em cima de 9° de subida vira enjoo.
   */
  it('o tremor é muito menor que a subida', () => {
    const recoil = createWeaponRecoil(true)
    kickRecoil(recoil)
    const out = emptyOffset()
    advanceRecoil(recoil, FRAME_S, out)
    expect(toDeg(Math.abs(out.rollRad))).toBeLessThan(0.2)
  })

  it('o pente inteiro em rajada empilharia mais de cinco graus de correção', () => {
    const recoil = createWeaponRecoil(true)
    for (let shot = 0; shot < 5; shot += 1) kickRecoil(recoil)
    expect(toDeg(-settle(recoil, 3))).toBeGreaterThan(5)
  })
})

describe('o tremor', () => {
  it('o tiro treme a câmera e o tremor some sozinho', () => {
    const recoil = createWeaponRecoil(true)
    kickRecoil(recoil)
    const out = emptyOffset()
    advanceRecoil(recoil, FRAME_S, out)
    advanceRecoil(recoil, FRAME_S, out)
    expect(Math.abs(out.rollRad)).toBeGreaterThan(0)
    settle(recoil, 2)
    advanceRecoil(recoil, FRAME_S, out)
    expect(Math.abs(out.rollRad)).toBeLessThan(1e-4)
  })

  /** O tremor não pode virar mira: ele volta ao zero, sem deixar resíduo. */
  it('o tremor não desloca a mira no fim das contas', () => {
    const recoil = createWeaponRecoil(true)
    kickRecoil(recoil)
    expect(settle(recoil, 3)).toBeCloseTo(-residualKickRad(), 4)
  })
})

describe('menos movimento', () => {
  it('desligado, o tiro não mexe na câmera', () => {
    const recoil = createWeaponRecoil(false)
    kickRecoil(recoil)
    const out = emptyOffset()
    advanceRecoil(recoil, FRAME_S, out)
    expect(out.pitchDeltaRad).toBe(0)
    expect(out.rollRad).toBe(0)
  })
})

describe('advanceRecoil', () => {
  it('recusa tempo de quadro que anda para trás', () => {
    expect(() => advanceRecoil(createWeaponRecoil(true), -1, emptyOffset())).toThrow(
      /dtS recebeu -1/,
    )
  })
})
