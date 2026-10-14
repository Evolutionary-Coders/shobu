import { describe, expect, it, vi } from 'vitest'
import { type PointerLockTarget, requestRawPointerLock } from './rawPointerLock.ts'

/** Uma trava de mentira: anota cada pedido e responde como mandarem. */
class FakeLockTarget implements PointerLockTarget {
  readonly requests: ({ unadjustedMovement?: boolean } | undefined)[] = []
  constructor(
    private readonly answer: (options?: { unadjustedMovement?: boolean }) => Promise<void>,
  ) {}
  requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> {
    this.requests.push(options)
    return this.answer(options)
  }
}

function refusal(name: string): Error {
  const error = new Error(`recusado: ${name}`)
  error.name = name
  return error
}

describe('requestRawPointerLock', () => {
  it('pede a trava com o mouse cru', async () => {
    const target = new FakeLockTarget(async () => {})
    await requestRawPointerLock(target)
    expect(target.requests).toEqual([{ unadjustedMovement: true }])
  })

  it('sem suporte ao mouse cru, cai na trava simples', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const target = new FakeLockTarget(async (options) => {
      if (options?.unadjustedMovement) throw refusal('NotSupportedError')
    })
    await requestRawPointerLock(target)
    expect(target.requests).toEqual([{ unadjustedMovement: true }, undefined])
    warn.mockRestore()
  })

  it('outra recusa sobe para quem chamou, sem segunda tentativa', async () => {
    const target = new FakeLockTarget(async () => {
      throw refusal('SecurityError')
    })
    await expect(requestRawPointerLock(target)).rejects.toThrow(/SecurityError/)
    expect(target.requests).toHaveLength(1)
  })

  it('recusa que não é Error também sobe', async () => {
    const target = new FakeLockTarget(() => Promise.reject('texto'))
    await expect(requestRawPointerLock(target)).rejects.toBe('texto')
  })
})
