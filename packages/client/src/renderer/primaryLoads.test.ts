import type { PrimaryWeapon } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import {
  createPrimaryLoads,
  MAX_LOAD_ATTEMPTS,
  type PrimaryLoads,
  primaryFailed,
  primaryLoaded,
  RETRY_AFTER_S,
  wantPrimary,
} from './primaryLoads.ts'
import { shownPrimary } from './primaryModels.ts'

/** O downloader de mentira: só anota o que a regra mandou baixar. */
class RecordingDownloader {
  readonly started: PrimaryWeapon[] = []
  readonly start = (weapon: PrimaryWeapon): void => {
    this.started.push(weapon)
  }
}

function laserFailedAt(nowS: number): { loads: PrimaryLoads; downloads: RecordingDownloader } {
  const loads = createPrimaryLoads()
  const downloads = new RecordingDownloader()
  wantPrimary(loads, 'laser', 0, downloads.start)
  primaryFailed(loads, 'laser', nowS, downloads.start)
  return { loads, downloads }
}

describe('wantPrimary', () => {
  it('pede o modelo uma vez só, mesmo chamado a cada quadro', () => {
    const loads = createPrimaryLoads()
    const downloads = new RecordingDownloader()
    for (let frame = 0; frame < 3; frame += 1) wantPrimary(loads, 'laser', frame, downloads.start)
    expect(downloads.started).toEqual(['laser'])
  })

  it('o que já chegou não é pedido de novo', () => {
    const loads = createPrimaryLoads()
    const downloads = new RecordingDownloader()
    wantPrimary(loads, 'classic', 0, downloads.start)
    primaryLoaded(loads, 'classic')
    wantPrimary(loads, 'classic', 100, downloads.start)
    expect(downloads.started).toEqual(['classic'])
    expect([...loads.loaded]).toEqual(['classic'])
  })
})

describe('a queda para a outra arma', () => {
  /** Regressão: com a laser fora do ar, nada caía para a clássica e a mão ficava vazia. */
  it('a laser que falha pede a clássica na hora, e a clássica vai para a mão', () => {
    const { loads, downloads } = laserFailedAt(1)
    expect(downloads.started).toEqual(['laser', 'classic'])
    primaryLoaded(loads, 'classic')
    expect(shownPrimary('laser', loads.loaded)).toBe('classic')
  })

  it('quem ainda quer a arma que falhou pede as outras, se elas também falharam antes', () => {
    const { loads, downloads } = laserFailedAt(0)
    primaryFailed(loads, 'classic', 0, downloads.start)
    wantPrimary(loads, 'laser', RETRY_AFTER_S, downloads.start)
    expect(downloads.started).toEqual(['laser', 'classic', 'laser', 'classic'])
  })

  it('a arma que chegou não puxa as outras', () => {
    const loads = createPrimaryLoads()
    const downloads = new RecordingDownloader()
    wantPrimary(loads, 'laser', 0, downloads.start)
    primaryLoaded(loads, 'laser')
    wantPrimary(loads, 'laser', 1, downloads.start)
    expect(downloads.started).toEqual(['laser'])
  })
})

describe('a nova tentativa', () => {
  it('espera o intervalo depois da falha', () => {
    const { loads, downloads } = laserFailedAt(10)
    wantPrimary(loads, 'laser', 10 + RETRY_AFTER_S - 0.1, downloads.start)
    expect(downloads.started).toEqual(['laser', 'classic'])
    wantPrimary(loads, 'laser', 10 + RETRY_AFTER_S, downloads.start)
    expect(downloads.started).toEqual(['laser', 'classic', 'laser'])
  })

  it(`para depois de ${MAX_LOAD_ATTEMPTS} tentativas`, () => {
    const loads = createPrimaryLoads()
    const downloads = new RecordingDownloader()
    for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS + 2; attempt += 1) {
      const nowS = attempt * RETRY_AFTER_S
      wantPrimary(loads, 'classic', nowS, downloads.start)
      primaryFailed(loads, 'classic', nowS, downloads.start)
    }
    const classic = downloads.started.filter((weapon) => weapon === 'classic')
    expect(classic).toHaveLength(MAX_LOAD_ATTEMPTS)
  })
})
