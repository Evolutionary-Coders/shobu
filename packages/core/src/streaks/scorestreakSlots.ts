import type { ScorestreaksConfig } from '../config/gameplayConfig.ts'
import {
  isScorestreakAvailable,
  type ScorestreakSlug,
  scorestreakCost,
} from './scorestreakCatalog.ts'

/** Quantas séries o jogador leva para a partida. É o "escolhe três" do CoD. */
export const SCORESTREAK_SLOT_COUNT = 3

/**
 * As séries que um combatente levou e o que ele já ganhou com elas (ADR 0029).
 *
 * Duas marcas por slot, e não uma: `earnedThisLife` é a regra do CoD de que
 * cada série sai **uma vez por vida** — sem ela, quem passa de 400 pontos
 * ganharia o PING a cada kill seguinte —, e `ready` é a série ganha que ainda
 * não foi usada. A morte apaga a primeira e **não** a segunda: série ganha e
 * guardada atravessa a morte, como no CoD.
 */
export interface ScorestreakSlots {
  readonly loadout: readonly ScorestreakSlug[]
  readonly earnedThisLife: boolean[]
  readonly ready: boolean[]
}

/**
 * As três séries padrão, para quem nunca abriu a tela: uma de cada peso, das
 * que não pedem nada além do que o jogador já sabe fazer. Só disponíveis — o
 * GOLPE ORBITAL saiu da terceira vaga quando ficou bloqueado (plano de 09/11),
 * e o PULSO EMP é a pesada que sobrou com efeito.
 */
export const DEFAULT_SCORESTREAK_LOADOUT: readonly ScorestreakSlug[] = ['ping', 'rapid-bolt', 'emp']

/**
 * Valida a escolha que chega do menu ou da rede: três slugs **disponíveis** do
 * catálogo, sem repetir. Devolve a lista tipada; o erro diz o que veio e o que
 * se esperava. A série bloqueada é recusada como a desconhecida: o servidor
 * não troca nada, e o jogador fica com o que já levava — o padrão, para quem
 * acabou de entrar.
 *
 * ```ts
 * parseScorestreakLoadout(['ping', 'sonar', 'emp']) // ['ping', 'sonar', 'emp']
 * ```
 *
 * @throws TypeError formato, slug desconhecido, bloqueado ou repetido
 */
export function parseScorestreakLoadout(raw: unknown): readonly ScorestreakSlug[] {
  const expected = `esperado ${SCORESTREAK_SLOT_COUNT} slugs distintos e disponíveis do catálogo de séries`
  if (!Array.isArray(raw) || raw.length !== SCORESTREAK_SLOT_COUNT) {
    throw new TypeError(`séries recebeu ${JSON.stringify(raw)}; ${expected}`)
  }
  const refused = raw.filter((slug) => typeof slug !== 'string' || !isScorestreakAvailable(slug))
  if (refused.length > 0 || new Set(raw).size !== raw.length) {
    throw new TypeError(`séries recebeu ${JSON.stringify(raw)}; ${expected}`)
  }
  return raw as ScorestreakSlug[]
}

/**
 * Se as duas escolhas são a mesma, na mesma ordem. É a conta que o cliente usa
 * para saber se manda a escolha à sala, e a sala para saber se mexe nos slots.
 *
 * ```ts
 * sameScorestreakLoadout(['ping', 'sonar', 'emp'], ['ping', 'sonar', 'emp']) // true
 * ```
 */
export function sameScorestreakLoadout(
  a: readonly ScorestreakSlug[],
  b: readonly ScorestreakSlug[],
): boolean {
  return a.length === b.length && a.every((slug, index) => slug === b[index])
}

/**
 * Os slots de quem entra na partida: nada ganho, nada guardado.
 *
 * ```ts
 * const slots = createScorestreakSlots(parseScorestreakLoadout(choice))
 * ```
 */
export function createScorestreakSlots(loadout: readonly ScorestreakSlug[]): ScorestreakSlots {
  return {
    loadout,
    earnedThisLife: loadout.map(() => false),
    ready: loadout.map(() => false),
  }
}

/**
 * Marca como prontas as séries que os pontos da vida pagam e que esta vida
 * ainda não deu. Escreve os índices recém-ganhos em `into` — é o aviso de
 * "SÉRIE PRONTA" da tela — e o devolve.
 *
 * ```ts
 * earnScorestreaks(slots, score.scorestreakPoints, config.scorestreaks, earned)
 * ```
 */
export function earnScorestreaks(
  slots: ScorestreakSlots,
  points: number,
  config: ScorestreaksConfig,
  into: number[],
): readonly number[] {
  into.length = 0
  for (const [index, slug] of slots.loadout.entries()) {
    if (slots.earnedThisLife[index] || points < scorestreakCost(slug, config)) continue
    slots.earnedThisLife[index] = true
    slots.ready[index] = true
    into.push(index)
  }
  return into
}

/**
 * Gasta a série do slot, se ela está pronta. Devolve o slug gasto, ou
 * `undefined` — apertar o botão de uma série que não está pronta não faz nada.
 *
 * ```ts
 * const used = spendScorestreak(slots, 0) // 'ping'
 * ```
 */
export function spendScorestreak(
  slots: ScorestreakSlots,
  index: number,
): ScorestreakSlug | undefined {
  if (!slots.ready[index]) return undefined
  slots.ready[index] = false
  return slots.loadout[index]
}

/** A morte: a vida nova pode ganhar tudo de novo, e o que estava guardado continua. */
export function forgetScorestreakLife(slots: ScorestreakSlots): void {
  slots.earnedThisLife.fill(false)
}

/** A partida nova: nada ganho e nada guardado, com a mesma escolha. */
export function resetScorestreakSlots(slots: ScorestreakSlots): void {
  slots.earnedThisLife.fill(false)
  slots.ready.fill(false)
}
