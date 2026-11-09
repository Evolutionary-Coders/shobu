import type { ScorestreaksConfig } from '../config/gameplayConfig.ts'

/**
 * As doze séries de pontuação do shōbu (ADR 0029): slug, peso e rótulo. O
 * jogador escolhe três no menu, e o custo de cada uma mora em
 * `config/gameplay.json`, na chave que `costKey` aponta — a tabela diz **qual**
 * número é de qual série, e o arquivo diz **quanto**.
 *
 * ```ts
 * scorestreakBySlug('ping').label // 'PING'
 * ```
 */
export type ScorestreakSlug =
  | 'ping'
  | 'echo'
  | 'grapple-overclock'
  | 'decoy'
  | 'counter-ping'
  | 'optic-camo'
  | 'rapid-bolt'
  | 'sonar'
  | 'orbital-strike'
  | 'kamikaze-drone'
  | 'emp'
  | 'neon-sentry'

/** Leve é informação e mobilidade; pesada é a jogada da partida. */
export type ScorestreakTier = 'leve' | 'media' | 'pesada'

/**
 * A cor de destaque de cada peso — a escada leve → pesada em ciano, magenta e
 * vermelho neon. Uma cópia só: o script das miniaturas pinta a borda do cartão
 * com ela, e o `bootScorestreaks.css` repete o hex por peso (o css não importa
 * ts), trancado contra este mapa pelo `scorestreakTierCss.test.ts`.
 *
 * ```ts
 * const border = SCORESTREAK_TIER_ACCENT[streak.tier] // '#22d3ee' numa leve
 * ```
 */
export const SCORESTREAK_TIER_ACCENT: Readonly<Record<ScorestreakTier, string>> = {
  leve: '#22d3ee',
  media: '#f038c8',
  pesada: '#ff2a3d',
}

export interface Scorestreak {
  readonly slug: ScorestreakSlug
  readonly tier: ScorestreakTier
  /** Já em caixa alta: é assim que entra no menu e no hud. */
  readonly label: string
  readonly costKey: keyof ScorestreaksConfig
  /**
   * Se a série pode ser escolhida. As cinco sem efeito previsto para a feira
   * (plano de 09/11) ficam no catálogo — a grade mostra o que vem aí —, mas
   * nenhum caminho as leva para a partida: o menu, a rede e o bot as pulam.
   */
  readonly available: boolean
}

/** A ordem é a do menu: peso crescente, e dentro dele o custo padrão crescente. */
export const SCORESTREAK_CATALOG: readonly Scorestreak[] = [
  { slug: 'echo', tier: 'leve', label: 'ECO', costKey: 'echoCost', available: true },
  {
    slug: 'grapple-overclock',
    tier: 'leve',
    label: 'GANCHO OVERCLOCK',
    costKey: 'grappleOverclockCost',
    available: true,
  },
  { slug: 'ping', tier: 'leve', label: 'PING', costKey: 'pingCost', available: true },
  { slug: 'decoy', tier: 'leve', label: 'HOLOGRAMA ISCA', costKey: 'decoyCost', available: false },
  {
    slug: 'counter-ping',
    tier: 'media',
    label: 'CONTRA-PING',
    costKey: 'counterPingCost',
    available: true,
  },
  {
    slug: 'rapid-bolt',
    tier: 'media',
    label: 'FERROLHO RÁPIDO',
    costKey: 'rapidBoltCost',
    available: true,
  },
  { slug: 'sonar', tier: 'media', label: 'SONAR', costKey: 'sonarCost', available: true },
  {
    slug: 'optic-camo',
    tier: 'media',
    label: 'CAMUFLAGEM ÓPTICA',
    costKey: 'opticCamoCost',
    available: false,
  },
  {
    slug: 'orbital-strike',
    tier: 'pesada',
    label: 'GOLPE ORBITAL',
    costKey: 'orbitalStrikeCost',
    available: false,
  },
  {
    slug: 'kamikaze-drone',
    tier: 'pesada',
    label: 'DRONE KAMIKAZE',
    costKey: 'kamikazeDroneCost',
    available: false,
  },
  { slug: 'emp', tier: 'pesada', label: 'PULSO EMP', costKey: 'empCost', available: true },
  {
    slug: 'neon-sentry',
    tier: 'pesada',
    label: 'CAÇADOR NEON',
    costKey: 'neonSentryCost',
    available: false,
  },
]

const BY_SLUG = new Map<string, Scorestreak>(
  SCORESTREAK_CATALOG.map((streak) => [streak.slug, streak]),
)

/**
 * As séries que se podem escolher, na ordem do catálogo. É a lista única das
 * disponíveis: a validação da rede, o sorteio do bot e a seta do menu leem
 * daqui, em vez de cada um repetir quais estão bloqueadas.
 *
 * ```ts
 * AVAILABLE_SCORESTREAKS.some((streak) => streak.slug === 'orbital-strike') // false
 * ```
 */
export const AVAILABLE_SCORESTREAKS: readonly Scorestreak[] = SCORESTREAK_CATALOG.filter(
  (streak) => streak.available,
)

/** A série do slug, ou `undefined` quando o texto não é slug de nenhuma — é o que valida a rede. */
export function findScorestreak(slug: string): Scorestreak | undefined {
  return BY_SLUG.get(slug)
}

/**
 * Se o texto é slug de uma série que se pode escolher — desconhecido conta como não.
 *
 * ```ts
 * isScorestreakAvailable('sonar') // true
 * isScorestreakAvailable('orbital-strike') // false
 * ```
 */
export function isScorestreakAvailable(slug: string): boolean {
  return findScorestreak(slug)?.available === true
}

export function scorestreakBySlug(slug: ScorestreakSlug): Scorestreak {
  const streak = BY_SLUG.get(slug)
  if (!streak) {
    throw new RangeError(`scorestreakBySlug recebeu ${slug}; esperado um slug do catálogo`)
  }
  return streak
}

/**
 * Quanto a série custa, em pontos desde a última morte.
 *
 * ```ts
 * scorestreakCost('ping', config.scorestreaks) // 400
 * ```
 */
export function scorestreakCost(slug: ScorestreakSlug, config: ScorestreaksConfig): number {
  return config[scorestreakBySlug(slug).costKey]
}
