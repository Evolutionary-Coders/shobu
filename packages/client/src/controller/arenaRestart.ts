import {
  addPlayer,
  type GameplayConfig,
  isBenched,
  placeBot,
  rearmMelee,
  rearmWeapon,
  removePlayer,
  resetScoreboard,
  seatBots,
  setBotDifficulty,
  type Vector3,
} from '@shobu/core'
import type { ArenaParts } from './arenaParts.ts'
import type { ArenaSessionClocks, ArenaSessionOptions, MatchRules } from './arenaSession.ts'

/**
 * O começo e o fim de uma partida, fora do tick: o que `restartMatch` zera e o
 * que o relógio congela. Mora fora de `arenaSession.ts` para a sessão ficar
 * com a ordem do tick, como `arenaCombat.ts` fica com o combate.
 */

/**
 * Uma partida nova: relógio, placar, regras, e todo mundo de volta a um
 * spawn — o jogador no primeiro, que é onde a cena o põe no boot, e os bots
 * sorteados longe dele.
 *
 * ```ts
 * restartArena(session, options, parts, rules)
 * ```
 */
export function restartArena(
  session: ArenaSessionClocks,
  options: ArenaSessionOptions,
  parts: ArenaParts,
  rules: MatchRules,
): void {
  resetClocks(session, parts, rules)
  parts.squad.hostile = rules.hostileBots
  setBotDifficulty(parts.squad, options.config, rules.botDifficulty)
  // a classe vale a partir da entrada: a arma de corpo a corpo troca, e a
  // sniper volta à mão.
  parts.melee.weapon = rules.meleeWeapon
  respawnLocal(session, options, parts)
  seatBotsOnTheBoard(parts, options.config, rules.botCount)
  resetScoreboard(parts.scoreboard)
}

function resetClocks(session: ArenaSessionClocks, parts: ArenaParts, rules: MatchRules): void {
  session.matchTimeS = 0
  session.matchOver = false
  session.timed = rules.timed ?? false
  session.matchSeed += 1
  // a contagem fora da área não atravessa partidas: a nova começaria com um
  // prazo já gasto (revisão do PR #16).
  parts.boundary.outsideS = 0
  session.boundaryRemainingS = null
  session.boundaryDeaths = 0
}

/** Vivo, armado e no primeiro spawn: quem morreu no último segundo não começa morto. */
function respawnLocal(
  session: ArenaSessionClocks,
  options: ArenaSessionOptions,
  parts: ArenaParts,
): void {
  parts.local.alive = true
  parts.local.respawnLeftS = 0
  session.killedBy = null
  rearmWeapon(parts.weapon, options.config)
  rearmMelee(parts.melee)
  // a lista nunca é vazia (`requireRespawns`).
  options.character.respawnAt(parts.respawns[0] as Readonly<Vector3>)
}

/**
 * Senta os bots da contagem, cada um num spawn novo, e tira do placar os que
 * foram para o banco: o tab não mostra quem não está na sala. Quem volta do
 * banco entra no fim do placar.
 *
 * Cada bot é posto **uma** vez: quem volta do banco já ganhou spawn no
 * `seatBots`, e pô-lo de novo gastava duas tiradas da semente e deslocava o
 * spawn de todos os seguintes (revisão do PR #31). Exportada para o teste
 * contar as tiradas.
 *
 * ```ts
 * seatBotsOnTheBoard(parts, config, rules.botCount)
 * ```
 */
export function seatBotsOnTheBoard(parts: ArenaParts, config: GameplayConfig, count: number): void {
  const returning = parts.squad.bots.filter(isBenched)
  seatBots(parts.squad, parts.fighters, count, config)
  for (const bot of parts.squad.bots) {
    if (isBenched(bot)) {
      removePlayer(parts.scoreboard, bot.id)
      continue
    }
    if (!returning.includes(bot)) placeBot(parts.squad, bot, parts.fighters, config)
    addPlayer(parts.scoreboard, bot.id)
  }
}

/**
 * O tempo acabou: a arma volta pronta — o que fecha a luneta e desfaz uma
 * recarga pela metade — e a lâmina volta à bainha. Daqui em diante o tick
 * não roda mais (`matchOver`), então o corpo para como na morte: a corda do
 * gancho presa ficava desenhada atrás da tela do MVP (revisão do PR #31).
 *
 * ```ts
 * endMatch(session, options, parts)
 * ```
 */
export function endMatch(
  session: ArenaSessionClocks,
  options: ArenaSessionOptions,
  parts: ArenaParts,
): void {
  session.matchOver = true
  session.grappleInReach = false
  options.character.holdStill()
  rearmWeapon(parts.weapon, options.config)
  rearmMelee(parts.melee)
}
