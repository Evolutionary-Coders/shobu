import { describe, expect, it } from 'vitest'
import { arenaSightLineM, fogTransmittance, MIN_SIGHT_LINE_TRANSMITTANCE } from './arenaFogSpec.ts'
import { relativeLuminance } from './daySky.ts'
import { NEON_KAIDO_PLAY_AREA } from './neonKaido.ts'
import { neonKaidoAtmosphere } from './neonKaidoAtmosphere.ts'

describe('neonKaidoAtmosphere', () => {
  const { sky, fog, lighting, rain } = neonKaidoAtmosphere()

  /** Regra de jogo, não de arte: o alvo da quina oposta não some na névoa. */
  it('a névoa deixa ver a diagonal inteira da área de jogo', () => {
    const transmittance = fogTransmittance(fog.density, arenaSightLineM(NEON_KAIDO_PLAY_AREA))
    expect(transmittance).toBeGreaterThanOrEqual(MIN_SIGHT_LINE_TRANSMITTANCE)
  })

  it('a névoa desbota para o horizonte do céu, sem linha entre os dois', () => {
    expect(fog.colorRgb).toEqual(sky.horizonRgb)
  })

  it('é noite: o alto do céu é escuro', () => {
    expect(relativeLuminance(sky.zenithRgb)).toBeLessThan(0.15)
  })

  /** O competidor só tem a luz dinâmica: ela não pode ser escura como a cena. */
  it('a luz do personagem soma pelo menos 1, para ele recortar contra a rua', () => {
    expect(lighting.key.intensity + lighting.fill.intensity).toBeGreaterThanOrEqual(1)
    expect(lighting.key.directionM).toEqual(sky.sunTravelM)
  })

  it('chove', () => {
    expect(rain?.curtainsM.length).toBeGreaterThan(0)
  })
})
