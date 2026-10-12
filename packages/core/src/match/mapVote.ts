import { createSeededRandom, nextUnit, type SeededRandom } from '../math/seededRandom.ts'

/**
 * O voto do próximo mapa, nos dez segundos da tela de MVP. Funções puras sobre
 * uma lista de votos, sem dom nem relógio de parede: hoje quem chama é o
 * cliente sozinho; amanhã é o servidor autoritativo, que recebe o voto de cada
 * jogador como mensagem e decide com as mesmas funções (ADR 0022).
 *
 * As regras:
 *
 * - **as opções** são os mapas do catálogo, na ordem dele, e por último
 *   `ALEATÓRIO` (`RANDOM_MAP_OPTION`);
 * - **um voto por jogador**: votar de novo troca o voto, não soma;
 * - **os bots votam também**, cada um uma vez, num instante sorteado da
 *   janela — a tela os mostra chegando —, tudo da semente da partida: a
 *   mesma partida vota sempre igual, e o servidor chega ao mesmo voto;
 * - **a maioria vence**; **empate é sorteio** da semente entre os empatados —
 *   inclusive ninguém votar, que é todo mundo empatado em zero. Nem o mapa de
 *   agora nem o primeiro da lista ganham o empate de graça;
 * - **`ALEATÓRIO` vencendo** sorteia, da mesma semente, um dos mapas.
 */

/** A opção que não é mapa: vencendo, sorteia um. */
export const RANDOM_MAP_OPTION = 'random'

export interface MapBallot {
  readonly voterId: string
  readonly optionId: string
  /** Segundos desde que a votação abriu. É o que deixa a tela mostrar o voto chegando. */
  readonly atS: number
}

export interface MapVoteOutcome {
  /** A opção que venceu: um mapa, ou `RANDOM_MAP_OPTION`. */
  readonly optionId: string
  /** O mapa da próxima partida: o da opção, ou o sorteado por ela. */
  readonly mapId: string
  /** Se a opção venceu no sorteio do empate. */
  readonly tied: boolean
}

/** Quando os bots votam, em segundos desde que a votação abriu. */
export interface BallotWindow {
  readonly fromS: number
  readonly untilS: number
}

/**
 * ```ts
 * mapVoteOptions(['neon-kaido', 'ichiban-gai']) // ['neon-kaido', 'ichiban-gai', 'random']
 * ```
 */
export function mapVoteOptions(mapIds: readonly string[]): readonly string[] {
  if (mapIds.length === 0) {
    throw new RangeError('mapVoteOptions recebeu []; esperado ao menos um id de mapa')
  }
  return [...mapIds, RANDOM_MAP_OPTION]
}

/**
 * O voto de cada bot, na ordem em que chegam. Cada bot tira da própria
 * sequência da semente — o primeiro número escolhe a opção, o segundo o
 * instante —, então tirar ou pôr um bot não muda o voto dos outros.
 *
 * ```ts
 * botBallots(['bot-0', 'bot-1'], options, matchSeed, { fromS: 1, untilS: 7 })
 * ```
 */
export function botBallots(
  botIds: readonly string[],
  optionIds: readonly string[],
  seed: number,
  window: Readonly<BallotWindow>,
): readonly MapBallot[] {
  const ballots = botIds.map((voterId, index) => {
    const rng = createSeededRandom(seed + BOT_SEED_STRIDE * (index + 1))
    const optionId = pick(optionIds, rng)
    const atS = window.fromS + nextUnit(rng) * (window.untilS - window.fromS)
    return { voterId, optionId, atS }
  })
  return ballots.sort((a, b) => a.atS - b.atS)
}

/** Um primo, para a semente de um bot não cair na sequência do vizinho. */
const BOT_SEED_STRIDE = 7_919

/**
 * O voto novo, no lugar do anterior do mesmo jogador. Não muta a lista.
 *
 * ```ts
 * ballots = castBallot(ballots, { voterId: 'local', optionId: 'ichiban-gai', atS: 3.2 })
 * ```
 */
export function castBallot(
  ballots: readonly MapBallot[],
  ballot: Readonly<MapBallot>,
): readonly MapBallot[] {
  return [...ballots.filter((cast) => cast.voterId !== ballot.voterId), ballot]
}

/** Os votos que já chegaram em `nowS`: os dos bots entram um a um. */
export function ballotsCastBy(ballots: readonly MapBallot[], nowS: number): readonly MapBallot[] {
  return ballots.filter((ballot) => ballot.atS <= nowS)
}

/**
 * Quantos votos cada opção tem, na ordem das opções.
 *
 * ```ts
 * tallyMapVote(['a', 'b', 'random'], ballots) // [2, 1, 0]
 * ```
 */
export function tallyMapVote(
  optionIds: readonly string[],
  ballots: readonly MapBallot[],
): readonly number[] {
  const counts = optionIds.map(() => 0)
  for (const ballot of ballots) {
    const index = optionIds.indexOf(ballot.optionId)
    if (index < 0) {
      throw new RangeError(
        `voto de ${ballot.voterId} em '${ballot.optionId}'; esperado uma de [${optionIds.join(', ')}]`,
      )
    }
    counts[index] = (counts[index] as number) + 1
  }
  return counts
}

/**
 * O resultado: a maioria, o sorteio do empate, e o sorteio do ALEATÓRIO —
 * nesta ordem, da mesma semente.
 *
 * ```ts
 * decideMapVote(options, ballots, matchSeed).mapId // 'ichiban-gai'
 * ```
 */
export function decideMapVote(
  optionIds: readonly string[],
  ballots: readonly MapBallot[],
  seed: number,
): MapVoteOutcome {
  const counts = tallyMapVote(optionIds, ballots)
  const most = Math.max(...counts)
  const leaders = optionIds.filter((_, index) => counts[index] === most)
  const rng = createSeededRandom(seed)
  const optionId = leaders.length === 1 ? (leaders[0] as string) : pick(leaders, rng)
  return { optionId, mapId: mapOfOption(optionId, optionIds, rng), tied: leaders.length > 1 }
}

function mapOfOption(optionId: string, optionIds: readonly string[], rng: SeededRandom): string {
  if (optionId !== RANDOM_MAP_OPTION) return optionId
  const maps = optionIds.filter((id) => id !== RANDOM_MAP_OPTION)
  if (maps.length === 0) {
    throw new RangeError(
      `opções [${optionIds.join(', ')}] sem mapa nenhum para o ALEATÓRIO sortear`,
    )
  }
  return pick(maps, rng)
}

function pick(ids: readonly string[], rng: SeededRandom): string {
  return ids[Math.floor(nextUnit(rng) * ids.length)] as string
}
