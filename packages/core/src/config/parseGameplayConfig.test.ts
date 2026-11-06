import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { BotSkillConfig } from './gameplayConfig.ts'
import { GAMEPLAY_CONFIG_SPEC } from './gameplayConfigSpec.ts'
import { parseGameplayConfig } from './parseGameplayConfig.ts'

const SHIPPED_CONFIG_URL = new URL('../../../../config/gameplay.json', import.meta.url)

/** Config válida derivada da própria spec, para o teste não envelhecer com ela. */
function validConfig(): Record<string, Record<string, number>> {
  const config: Record<string, Record<string, number>> = {}
  for (const spec of GAMEPLAY_CONFIG_SPEC) {
    const section = config[spec.section] ?? {}
    section[spec.key] = (spec.minInclusive + spec.maxInclusive) / 2
    config[spec.section] = section
  }
  return config
}

describe('parseGameplayConfig', () => {
  it('aceita uma config com todas as chaves da spec dentro da faixa', () => {
    expect(() => parseGameplayConfig(validConfig())).not.toThrow()
  })

  it('aceita o config/gameplay.json versionado no repositório', () => {
    const shipped: unknown = JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8'))
    expect(() => parseGameplayConfig(shipped)).not.toThrow()
  })

  it('o voto de expulsão do config versionado cabe numa sala cheia', () => {
    const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))
    // a ordem entre os dois não é estrita, e `GAMEPLAY_FIELD_ORDER_SPEC` só tranca a estrita.
    expect(shipped.match.kickVoteMinHumans).toBeLessThanOrEqual(shipped.match.playersPerRoom)
  })

  it('rejeita chave desconhecida, que é como um rename passaria em silêncio', () => {
    const config = validConfig()
    config.movement = { ...config.movement, runSpeedMS: 8 }
    expect(() => parseGameplayConfig(config)).toThrow(/runSpeedMS/)
  })

  it('rejeita seção desconhecida', () => {
    expect(() => parseGameplayConfig({ ...validConfig(), audio: {} })).toThrow(/audio/)
  })

  it('rejeita chave ausente citando o caminho', () => {
    const config = validConfig()
    delete config.movement?.runSpeedMps
    expect(() => parseGameplayConfig(config)).toThrow(/movement\.runSpeedMps/)
  })

  it('rejeita valor fora da faixa citando o valor recebido', () => {
    const config = validConfig()
    config.camera = { ...config.camera, baseFovDeg: 400 }
    expect(() => parseGameplayConfig(config)).toThrow(/400/)
  })

  it('rejeita valor não numérico', () => {
    const config = validConfig()
    config.match = { ...config.match, durationS: '300' as unknown as number }
    expect(() => parseGameplayConfig(config)).toThrow(/match\.durationS/)
  })

  it('rejeita o aviso de inatividade que não vem antes do kick, citando os dois valores', () => {
    const config = validConfig()
    config.match = { ...config.match, afkWarnS: 60, afkKickS: 60 }
    expect(() => parseGameplayConfig(config)).toThrow(
      /match\.afkWarnS recebeu 60 e match\.afkKickS recebeu 60/,
    )
  })

  /** Sem aquecimento, a vaga de quem recarrega no mapa novo nunca espera. */
  it('rejeita aquecimento curto demais para a recarga, citando o valor e a faixa', () => {
    const config = validConfig()
    config.match = { ...config.match, warmupS: 0 }
    expect(() => parseGameplayConfig(config)).toThrow(
      'match.warmupS recebeu 0; esperado entre 5 e 60 (inclusive)',
    )
  })

  it.each([null, 42, 'config', []])('rejeita raiz que não é objeto: %p', (raw) => {
    expect(() => parseGameplayConfig(raw)).toThrow(/esperado objeto/)
  })
})

/**
 * Números que só fazem sentido em relação a outro. Um valor sozinho passa na
 * faixa da spec e ainda assim quebra a regra do jogo, e é aqui que isso falha.
 */
describe('as relações entre os números da arma', () => {
  const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

  /** Recarregar mais rápido que ciclar o ferrolho tornaria o ferrolho inútil. */
  it('a recarga custa mais que um ciclo de ferrolho', () => {
    expect(shipped.weapon.reloadS).toBeGreaterThan(shipped.weapon.boltCycleS)
  })

  /**
   * O quick scope do modelo de simulação: a precisão total chega **antes** de o
   * zoom terminar, e é isso que separa os dois tempos em chaves distintas.
   */
  it('a precisão da mira chega antes de o zoom terminar', () => {
    expect(shipped.weapon.scopeSettleS).toBeLessThan(shipped.camera.scopeTransitionS)
  })

  it('a mira fecha o fov em vez de abrir', () => {
    expect(shipped.camera.scopedFovDeg).toBeLessThan(shipped.camera.baseFovDeg)
  })

  /** Pilar 3: mirar é a única troca do jogo, e ela tem que custar velocidade. */
  it('mirar anda mais devagar que correr', () => {
    expect(shipped.weapon.scopedMoveSpeedMps).toBeLessThan(shipped.movement.runSpeedMps)
  })
})

describe('as relações entre os números dos bots', () => {
  const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

  const levels = [shipped.botSkillEasy, shipped.botSkillNormal, shipped.botSkillHard]

  /** A mira converge: o erro que sobra não pode ser maior que o do primeiro instante. */
  it('em todo nível, a mira assentada erra menos que a mira de chegada', () => {
    for (const skill of levels) expect(skill.aimResidualDeg).toBeLessThanOrEqual(skill.aimErrorDeg)
  })

  /** O primeiro tiro tem que carregar erro de chegada: a reação acaba antes de a mira assentar. */
  it('em todo nível, a reação mais lenta acaba antes de a mira assentar', () => {
    for (const skill of levels) {
      expect(skill.reactionS + skill.reactionSpreadS).toBeLessThan(skill.aimSettleS)
    }
  })

  /** Fácil é fácil em tudo: nenhum número do fácil pode ser mais afiado que o do normal. */
  it('os níveis ficam em ordem em cada número', () => {
    for (const key of Object.keys(shipped.botSkillNormal) as (keyof BotSkillConfig)[]) {
      const [easy, normal, hard] = levels.map((skill) => skill[key]) as [number, number, number]
      expect([key, easy >= normal, normal >= hard]).toEqual([key, true, true])
    }
  })

  /** Quem abre a luneta além do que enxerga nunca abre a luneta. */
  it('a distância da luneta cabe no alcance de visão', () => {
    expect(shipped.bots.scopeBeyondM).toBeLessThan(shipped.bots.sightRangeM)
  })
})

describe('as relações entre os números do radar', () => {
  const shipped = parseGameplayConfig(JSON.parse(readFileSync(SHIPPED_CONFIG_URL, 'utf8')))

  /** O pedido do playtest: um PING de 15 s que varre a cada 3 s. */
  it('o PING varre mais de uma vez enquanto dura', () => {
    expect(shipped.radar.pingDurationS / shipped.radar.pingSweepEveryS).toBeGreaterThan(1)
  })

  /** Ponto que dura além da varredura seguinte mostra o mesmo inimigo em dois lugares. */
  it('o ponto de uma varredura não dura mais que o intervalo até a próxima', () => {
    expect(shipped.radar.blipFadeS).toBeLessThanOrEqual(shipped.radar.pingSweepEveryS)
  })
})
