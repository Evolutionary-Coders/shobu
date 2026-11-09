import {
  addPlayer,
  closeScope,
  createMatchCycle,
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
import { restartArenaRadar } from './arenaRadar.ts'
import { restartArenaScorestreaks } from './arenaScorestreaks.ts'
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
  parts.botCount = rules.botCount
  // online a sala não recomeça com o menu: o corpo, o spawn e quem está nas
  // vagas dos bots são do servidor (`arenaOnline.ts`).
  if (!parts.online) respawnLocal(session, options, parts)
  // online a arma não rearma, e a luneta de antes do Esc voltava aberta no
  // ENTRAR (playtest 09/11); o servidor a fecha no mesmo gesto (`seatTookControl`).
  else closeScope(parts.weapon)
  if (!parts.online) seatBotsOnTheBoard(parts, options.config, rules.botCount)
  // online o placar é da sala, que segue de pé atrás do menu: só a entrada
  // numa sala (`enterRoom`) e a partida nova dela o zeram. Zerado aqui, o Esc +
  // ENTRAR dava o primeiro sangue de novo e perdia a sequência e as medalhas.
  if (!parts.online) resetScoreboard(parts.scoreboard)
  restartArenaScorestreaks(parts, rules)
  // online o relógio da sessão não volta a zero (`resetClocks`), e os efeitos
  // e o PING seguem valendo na sala atrás do menu: apagá-los aqui soltava a
  // luneta e o gancho que o servidor ainda trava.
  if (!parts.online) restartArenaRadar(parts)
}

function resetClocks(session: ArenaSessionClocks, parts: ArenaParts, rules: MatchRules): void {
  session.matchSeed += 1
  parts.timed = rules.timed ?? false
  // online, o ciclo da partida é da sala (ADR 0031), e a contagem e o rodízio
  // da área são do assento no servidor, que não recomeça com o menu: zerar só
  // aqui poria a predição noutro spawn.
  if (parts.online) return
  // só offline o relógio recomeça: online os prazos dos efeitos das séries
  // são contados nele, e a sala não recomeça com o ENTRAR.
  session.matchTimeS = 0
  // offline não há aquecimento: não há quem esperar, e o treino e os bots
  // ficam como sempre foram (ADR 0031).
  session.matchCycle = createMatchCycle({ warmup: false, timed: parts.timed })
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
 * A partida acabou: a arma volta pronta — o que fecha a luneta e desfaz uma
 * recarga pela metade — e a lâmina volta à bainha. O ciclo já congelou
 * (`matchOver`), e daqui em diante o tick não roda mais, então o corpo para
 * como na morte: a corda do gancho presa ficava desenhada atrás da tela do
 * MVP (revisão do PR #31).
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
  session.grappleInReach = false
  options.character.holdStill()
  rearmWeapon(parts.weapon, options.config)
  rearmMelee(parts.melee)
}
