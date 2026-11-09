import type { GameplayConfig } from '../config/gameplayConfig.ts'
import type { CharacterState } from '../movement/characterState.ts'
import type { WeaponState } from '../weapon/weaponState.ts'
import {
  type RadarState,
  resetRadarState,
  startPingPulse,
  startRadarJam,
  startSonarSweep,
} from './radarPulse.ts'
import type { ScorestreakSlug } from './scorestreakCatalog.ts'
import type { ScorestreakNotice } from './scorestreakLedger.ts'

/**
 * O que cada série faz quando é acionada (ADR 0029, plano de 09/11). O radar
 * (`radarPulse.ts`) guarda o que mexe no minimapa; aqui fica o resto: os
 * efeitos com prazo, por jogador, e a marca do ECO. O mesmo estado serve a
 * sala, que decide, e o cliente, que prevê o próprio corpo e pinta o hud — os
 * dois chegam a ele pelo mesmo aviso de acionamento, que vai para todos.
 */

/** O que as séries com efeito leem da config: cada uma lê só a sua seção. */
export type ScorestreakEffectsConfig = Pick<GameplayConfig, 'radar' | 'streakEffects'>

/** Quem o dono do ECO vê no minimapa, e até quando. */
export interface EchoMark {
  readonly subjectId: string
  readonly endsAtS: number
}

export interface ScorestreakEffects {
  /**
   * Jogador → série → até quando, no relógio da partida. É dos efeitos que
   * duram um tempo e não passam pelo radar (FERROLHO RÁPIDO, GANCHO
   * OVERCLOCK, PULSO EMP), que ganham efeito nos passos seguintes do plano.
   */
  readonly timers: Map<string, Map<ScorestreakSlug, number>>
  /** Dono do ECO → a marca dele. Ninguém escreve aqui até o ECO ganhar efeito. */
  readonly echoes: Map<string, EchoMark>
}

/**
 * Os efeitos que moram no corpo de quem acionou, e morrem com ele. O EMP não
 * está aqui: ele cega os outros, e a morte do dono não devolve a visão deles.
 */
const ENDS_WITH_DEATH: ReadonlySet<ScorestreakSlug> = new Set<ScorestreakSlug>([
  'rapid-bolt',
  'grapple-overclock',
])

type Activation = (
  effects: ScorestreakEffects,
  radar: RadarState,
  playerId: string,
  nowS: number,
  config: ScorestreakEffectsConfig,
) => void

/** A série sem entrada aqui não faz nada quando acionada. */
const ACTIVATIONS: Partial<Record<ScorestreakSlug, Activation>> = {
  ping: (_effects, radar, playerId, nowS, config) =>
    startPingPulse(radar, playerId, nowS, config.radar),
  sonar: (_effects, radar, playerId, nowS, config) =>
    startSonarSweep(radar, playerId, nowS, config.radar),
  'counter-ping': (_effects, radar, playerId, nowS, config) =>
    startRadarJam(radar, playerId, nowS, config.radar),
  'rapid-bolt': (effects, _radar, playerId, nowS, config) =>
    startTimedEffect(
      effects,
      playerId,
      'rapid-bolt',
      nowS + config.streakEffects.rapidBoltDurationS,
    ),
  'grapple-overclock': (effects, _radar, playerId, nowS, config) =>
    startTimedEffect(
      effects,
      playerId,
      'grapple-overclock',
      nowS + config.streakEffects.grappleOverclockDurationS,
    ),
}

/**
 * Nenhum efeito ainda.
 *
 * ```ts
 * const effects = createScorestreakEffects()
 * ```
 */
export function createScorestreakEffects(): ScorestreakEffects {
  return { timers: new Map(), echoes: new Map() }
}

/**
 * A entrada única de toda série acionada, na sala e no cliente, online e
 * offline: cada série escreve no radar ou nos efeitos. O aviso de série ganha
 * não faz nada, e a série sem efeito também não.
 *
 * ```ts
 * for (const notice of notices) applyScorestreakActivation(effects, radar, notice, nowS, config)
 * ```
 */
export function applyScorestreakActivation(
  effects: ScorestreakEffects,
  radar: RadarState,
  notice: Readonly<ScorestreakNotice>,
  nowS: number,
  config: ScorestreakEffectsConfig,
): void {
  if (notice.kind !== 'activated') return
  ACTIVATIONS[notice.scorestreak]?.(effects, radar, notice.playerId, nowS, config)
}

/**
 * Liga o efeito com prazo de `playerId` até `endsAtS`. Acionar de novo o que
 * está rodando recomeça a contagem.
 *
 * ```ts
 * startTimedEffect(effects, 'local', 'rapid-bolt', nowS + 20)
 * ```
 */
export function startTimedEffect(
  effects: ScorestreakEffects,
  playerId: string,
  slug: ScorestreakSlug,
  endsAtS: number,
): void {
  const own = effects.timers.get(playerId) ?? new Map<ScorestreakSlug, number>()
  own.set(slug, endsAtS)
  effects.timers.set(playerId, own)
}

/**
 * Se o efeito com prazo `slug` de `playerId` está valendo agora.
 *
 * ```ts
 * if (hasEffect(effects, 'local', 'rapid-bolt', nowS)) ...
 * ```
 */
export function hasEffect(
  effects: Readonly<ScorestreakEffects>,
  playerId: string,
  slug: ScorestreakSlug,
  nowS: number,
): boolean {
  const endsAtS = effects.timers.get(playerId)?.get(slug)
  return endsAtS !== undefined && nowS < endsAtS
}

/**
 * Liga ou desliga o FERROLHO RÁPIDO na arma de `playerId` para o tick que vem.
 * Roda antes de `stepArsenal`, em todo combatente que o passo anda — o
 * assento e o bot da sala, o jogador e o bot offline —, porque o passo da
 * arma não tem relógio e lê só a flag (`WeaponState.boltFree`).
 *
 * ```ts
 * armRapidBolt(seat.arsenal.weapon, room.scorestreaks.effects, seat.fighter.id, room.matchTimeS)
 * ```
 */
export function armRapidBolt(
  weapon: WeaponState,
  effects: Readonly<ScorestreakEffects>,
  playerId: string,
  nowS: number,
): void {
  weapon.boltFree = hasEffect(effects, playerId, 'rapid-bolt', nowS)
}

/**
 * Se o gancho de `playerId` está sem recarga agora (GANCHO OVERCLOCK). Quem
 * anda o corpo grava a resposta em `CharacterState.grappleFree` antes de
 * `stepCharacter`, em todo combatente — o assento e o bot da sala, o jogador
 * e o bot offline —, porque o passo do corpo não tem relógio.
 *
 * ```ts
 * seat.body.grappleFree = grappleFreeFor(room.scorestreaks.effects, seat.fighter.id, room.matchTimeS)
 * ```
 */
export function grappleFreeFor(
  effects: Readonly<ScorestreakEffects>,
  playerId: string,
  nowS: number,
): boolean {
  return hasEffect(effects, playerId, 'grapple-overclock', nowS)
}

/**
 * As flags das séries de `playerId` para o tick que vem, na arma e no corpo
 * de quem a sala ou o cliente anda inteiro (assento da sala, bots): roda
 * antes de `stepArsenal` e de `stepCharacter`. O jogador local põe as duas
 * por partes, porque a predição guarda o corpo dele.
 *
 * ```ts
 * armScorestreakFlags(bot.weapon, bot.body, room.scorestreaks.effects, bot.id, room.matchTimeS)
 * ```
 */
export function armScorestreakFlags(
  weapon: WeaponState,
  body: CharacterState,
  effects: Readonly<ScorestreakEffects>,
  playerId: string,
  nowS: number,
): void {
  armRapidBolt(weapon, effects, playerId, nowS)
  body.grappleFree = grappleFreeFor(effects, playerId, nowS)
}

/**
 * A morte leva os efeitos do corpo de `playerId` (`ENDS_WITH_DEATH`); o
 * resto continua até o prazo.
 *
 * ```ts
 * clearOwnTimedEffects(effects, kill.victimId)
 * ```
 */
export function clearOwnTimedEffects(effects: ScorestreakEffects, playerId: string): void {
  const own = effects.timers.get(playerId)
  if (!own) return
  for (const slug of ENDS_WITH_DEATH) own.delete(slug)
  if (own.size === 0) effects.timers.delete(playerId)
}

/**
 * A partida nova: nenhum efeito, PING nem embaralhamento sobra da anterior.
 *
 * ```ts
 * resetScorestreakEffects(room.scorestreaks.effects, room.scorestreaks.radar)
 * ```
 */
export function resetScorestreakEffects(effects: ScorestreakEffects, radar: RadarState): void {
  effects.timers.clear()
  effects.echoes.clear()
  resetRadarState(radar)
}
