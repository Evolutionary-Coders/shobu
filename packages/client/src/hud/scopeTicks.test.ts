import { readFileSync } from 'node:fs'
import { parseGameplayConfig } from '@shobu/core'
import { describe, expect, it } from 'vitest'
import { buildScopeLadder, LADDER_RANGES_M, type ScopeLadderOptions } from './scopeTicks.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)
const config = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

const VIEW_BOX = 1000
const base: ScopeLadderOptions = {
  scopedFovDeg: config.camera.scopedFovDeg,
  capsuleHeightM: config.collision.capsuleHeightM,
  rangesM: LADDER_RANGES_M,
  viewBoxSize: VIEW_BOX,
}

describe('buildScopeLadder', () => {
  it('desenha um traço por alcance', () => {
    expect(buildScopeLadder(base)).toHaveLength(LADDER_RANGES_M.length)
  })

  /** É telêmetro: alvo mais longe subtende menos ângulo, e o traço encolhe. */
  it('encolhe o traço conforme o alcance cresce', () => {
    const ticks = buildScopeLadder(base)
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index]?.halfWidth).toBeLessThan(ticks[index - 1]?.halfWidth ?? 0)
    }
  })

  it('desce a escada sem inverter a ordem dos alcances', () => {
    const ticks = buildScopeLadder(base)
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index]?.y).toBeGreaterThan(ticks[index - 1]?.y ?? 0)
    }
  })

  /** O traço mede a cápsula, não um número inventado: dobrar a altura dobra o traço. */
  it('mede o traço pela altura da cápsula', () => {
    const tall = buildScopeLadder({ ...base, capsuleHeightM: base.capsuleHeightM * 2 })
    const normal = buildScopeLadder(base)
    expect(tall[0]?.halfWidth ?? 0).toBeGreaterThan((normal[0]?.halfWidth ?? 0) * 1.9)
  })

  it('espalha os traços quando o fov da luneta fecha', () => {
    const tight = buildScopeLadder({ ...base, scopedFovDeg: base.scopedFovDeg / 2 })
    expect(tight[0]?.halfWidth ?? 0).toBeGreaterThan(buildScopeLadder(base)[0]?.halfWidth ?? 0)
  })

  it('mantém a escada inteira dentro do viewBox da lente', () => {
    for (const tick of buildScopeLadder(base)) {
      expect(tick.y).toBeGreaterThan(0)
      expect(tick.y).toBeLessThan(VIEW_BOX)
      expect(tick.halfWidth).toBeLessThan(VIEW_BOX / 2)
    }
  })

  it('rotula cada traço com o alcance em metros', () => {
    expect(buildScopeLadder(base).map((tick) => tick.label)).toEqual(['100', '200', '300', '400'])
  })

  it('recusa uma luneta que não fecha o fov', () => {
    expect(() => buildScopeLadder({ ...base, scopedFovDeg: 0 })).toThrow(/scopedFovDeg recebeu 0/)
    expect(() => buildScopeLadder({ ...base, capsuleHeightM: 0 })).toThrow(
      /capsuleHeightM recebeu 0/,
    )
  })
})
