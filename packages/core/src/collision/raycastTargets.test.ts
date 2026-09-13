import { describe, expect, it } from 'vitest'
import { createBoxHit } from './raycastBoxes.ts'
import { nearestTargetHit } from './raycastTargets.ts'
import { createTargetList, pushTarget, resetTargetList, type TargetList } from './targetList.ts'

/** O olho do atirador, na convenção de pé + altura de olho. */
const EYE = { x: 0, y: 1.66, z: 0 }
const FORWARD = { x: 0, y: 0, z: 1 }

const RADIUS_M = 0.4
const HEIGHT_M = 1.8

function targetsAt(...posts: readonly (readonly [number, number, number])[]): TargetList {
  const list = createTargetList(8)
  posts.forEach(([x, y, z], index) => {
    pushTarget(list, index * 10, { x, y, z }, RADIUS_M, HEIGHT_M)
  })
  return list
}

describe('nearestTargetHit', () => {
  const hit = createBoxHit()

  it('acerta o alvo na frente do raio e diz a que distância', () => {
    expect(nearestTargetHit(EYE, FORWARD, targetsAt([0, 0, 20]), 400, hit)).toBe(true)
    expect(hit.distanceM).toBeCloseTo(19.6)
  })

  it('ignora alvo atrás do atirador', () => {
    expect(nearestTargetHit(EYE, FORWARD, targetsAt([0, 0, -20]), 400, hit)).toBe(false)
  })

  it('ignora alvo fora da linha do raio', () => {
    expect(nearestTargetHit(EYE, FORWARD, targetsAt([9, 0, 20]), 400, hit)).toBe(false)
  })

  it('entre dois alvos enfileirados escolhe o da frente', () => {
    const targets = targetsAt([0, 0, 40], [0, 0, 15])
    expect(nearestTargetHit(EYE, FORWARD, targets, 400, hit)).toBe(true)
    expect(hit.index).toBe(10)
  })

  it('não alcança alvo além do alcance da arma', () => {
    expect(nearestTargetHit(EYE, FORWARD, targetsAt([0, 0, 500]), 400, hit)).toBe(false)
  })

  /** O tiro tem que passar por cima de quem está morto e deitado fora da lista. */
  it('só lê as caixas contadas, e ignora o lixo reaproveitado', () => {
    const targets = targetsAt([0, 0, 20])
    resetTargetList(targets)
    expect(nearestTargetHit(EYE, FORWARD, targets, 400, hit)).toBe(false)
  })

  it('a cápsula tem altura: o tiro no pé do alvo passa por baixo', () => {
    const overTheHead = { x: 0, y: 0.2, z: 1 }
    expect(nearestTargetHit(EYE, overTheHead, targetsAt([0, 0, 20]), 400, hit)).toBe(false)
  })

  it('recusa alcance que não avança', () => {
    expect(() => nearestTargetHit(EYE, FORWARD, targetsAt(), 0, hit)).toThrow(
      /maxDistanceM recebeu 0/,
    )
  })
})
