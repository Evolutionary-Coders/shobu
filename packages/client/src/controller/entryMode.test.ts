import { describe, expect, it } from 'vitest'
import { type EntryEnvironment, entryModeFor } from './entryMode.ts'

const DESKTOP: EntryEnvironment = { coarsePointer: false, hasOrientationSensor: false, query: '' }
const PHONE: EntryEnvironment = { coarsePointer: true, hasOrientationSensor: true, query: '' }

describe('entryModeFor', () => {
  it('desktop entra com o ponteiro travado', () => {
    expect(entryModeFor(DESKTOP)).toBe('pointer-lock')
  })

  it('celular com giroscópio entra no óculos', () => {
    expect(entryModeFor(PHONE)).toBe('headset')
  })

  it('tela de toque sem giroscópio não tem como olhar: fica no ponteiro', () => {
    expect(entryModeFor({ ...PHONE, hasOrientationSensor: false })).toBe('pointer-lock')
  })

  it('notebook com sensor de orientação mas mouse continua desktop', () => {
    expect(entryModeFor({ ...DESKTOP, hasOrientationSensor: true })).toBe('pointer-lock')
  })

  it('?vr=1 força o óculos, mesmo no desktop', () => {
    expect(entryModeFor({ ...DESKTOP, query: '?vr=1' })).toBe('headset')
  })

  it('?vr=0 força o desktop, mesmo no celular', () => {
    expect(entryModeFor({ ...PHONE, query: '?mode=x&vr=0' })).toBe('pointer-lock')
  })
})
