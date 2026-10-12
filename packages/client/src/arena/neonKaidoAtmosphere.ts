/**
 * A noite do Neon-kaidō: céu, névoa, luz dinâmica e chuva, como dado.
 *
 * O céu da referência quase não aparece — é uma fresta azul-acinzentada entre
 * os paredões, clareada pela luz da própria cidade —, e é essa a cor da névoa,
 * que apaga a base da megatorre. A névoa obedece à mesma regra de jogo da hora
 * azul (`arenaFogSpec.ts`): 0,9 de transmitância na diagonal da área de jogo,
 * para o alvo da quina oposta não sumir.
 *
 * A luz dinâmica só ilumina o que se move (o personagem) e o fundo `fundo-`:
 * a do cenário está no lightmap, cozida do neon. Por isso o preenchimento é
 * forte para uma noite — o competidor tem que recortar contra a rua escura —
 * e quente por baixo, que é o neon do chão molhado.
 */
import type { ArenaLightingSpec } from '../renderer/arenaLightingSpec.ts'
import type { ArenaAtmosphere } from './arenaCatalog.ts'
import type { ArenaFogSpec } from './arenaFogSpec.ts'
import type { DaySkySpec } from './daySky.ts'
import type { RainSpec } from './rainSpec.ts'

function nightSky(): DaySkySpec {
  return {
    zenithRgb: [0.1, 0.11, 0.17],
    horizonRgb: [0.36, 0.38, 0.5],
    belowHorizonRgb: [0.12, 0.12, 0.16],
    // a "lua": luz fria de cima, quase a pino, que só pega o alto das coisas.
    sunTravelM: [0.3, -0.8, 0.4],
    sunRgb: [0.55, 0.65, 0.95],
    sizePx: [4, 128],
  }
}

/**
 * 0,0032 deixa 0,905 de transmitância nos 99 m da diagonal de 70 × 70: o
 * máximo que a regra permite, porque é a névoa que dá escala à rua-cânion.
 */
function nightFog(sky: DaySkySpec): ArenaFogSpec {
  return { colorRgb: sky.horizonRgb, density: 0.0032 }
}

function nightLighting(sky: DaySkySpec): ArenaLightingSpec {
  return {
    key: { directionM: sky.sunTravelM, intensity: 0.35, colorRgb: sky.sunRgb },
    fill: { intensity: 0.9, skyRgb: [0.45, 0.5, 0.78], groundRgb: [0.78, 0.3, 0.6] },
    skyClearRgb: sky.horizonRgb,
  }
}

/**
 * Três cortinas: a de 2,5 m dá o risco grosso que passa rente ao olho, a de
 * 6 e a de 12 m dão a profundidade. Mais cortinas seriam mais draw calls para
 * um efeito que o olho já leu.
 *
 * ```ts
 * neonRain().curtainsM // [2.5, 6, 12]
 * ```
 */
export function neonRain(): RainSpec {
  return {
    sizePx: [64, 256],
    streaks: 110,
    seed: 2042,
    fallMps: 9,
    curtainsM: [2.5, 6, 12],
    curtainSizeM: [16, 12],
    tileM: [1.2, 4],
    brightness: 0.45,
  }
}

/**
 * ```ts
 * neonKaidoAtmosphere().fog.density // 0.0032
 * ```
 */
export function neonKaidoAtmosphere(): ArenaAtmosphere {
  const sky = nightSky()
  return { sky, fog: nightFog(sky), lighting: nightLighting(sky), rain: neonRain() }
}
