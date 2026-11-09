import { createSeededRandom, nextUnit } from '../math/seededRandom.ts'
import { AVAILABLE_SCORESTREAKS, type ScorestreakSlug } from './scorestreakCatalog.ts'
import { SCORESTREAK_SLOT_COUNT } from './scorestreakSlots.ts'

/**
 * Desloca a semente da partida para o sorteio das séries não cair na mesma
 * sequência de nenhum outro gerador semeado por ela (`spawnRng`, o esquadrão).
 */
const BOT_SCORESTREAK_SALT = 0x2c1b_3c6d

/**
 * As três séries do bot da vaga `botIndex` (ADR 0029). Gerador próprio, e não
 * o `rng` do bot nem o do esquadrão: tirar deles deslocaria cada decisão
 * seguinte do bot, e o cliente offline e o servidor divergiriam. Com a mesma
 * `seedBase` (`MATCH_SEED_BASE`), a mesma vaga leva as mesmas séries nos dois.
 * Fisher-Yates parcial sobre uma cópia das disponíveis — aloca, mas uma vez
 * por bot, não por tick. Da lista inteira, a sala recusaria a escolha do bot
 * que tirasse uma bloqueada.
 *
 * ```ts
 * enlistScorestreaks(ledger, bot.id, pickBotScorestreaks(MATCH_SEED_BASE, 2), true)
 * ```
 */
export function pickBotScorestreaks(
  seedBase: number,
  botIndex: number,
): readonly ScorestreakSlug[] {
  const pool = AVAILABLE_SCORESTREAKS.map((streak) => streak.slug)
  const rng = createSeededRandom((seedBase ^ BOT_SCORESTREAK_SALT) + botIndex)
  for (let index = 0; index < SCORESTREAK_SLOT_COUNT; index += 1) {
    const swap = index + Math.floor(nextUnit(rng) * (pool.length - index))
    const kept = pool[index] as ScorestreakSlug
    pool[index] = pool[swap] as ScorestreakSlug
    pool[swap] = kept
  }
  return pool.slice(0, SCORESTREAK_SLOT_COUNT)
}
