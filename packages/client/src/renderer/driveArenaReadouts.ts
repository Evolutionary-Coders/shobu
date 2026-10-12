import type { Scene } from '@babylonjs/core/scene'
import {
  type GameplayConfig,
  type PlayerScore,
  rankedScores,
  type Scoreboard,
  tacticalTankRatio,
  weaponPhase,
} from '@shobu/core'
import { type ArenaSession, LOCAL_PLAYER_ID } from '../controller/arenaSession.ts'
import type { HeldKeys } from '../controller/heldKeys.ts'
import type { InputMethod, InputMethodTracker } from '../controller/lastInputMethod.ts'
import type { ArenaHud } from '../hud/arenaHud.ts'
import { type BladeHintWatch, createBladeHintWatch, stepBladeHint } from '../hud/bladeHint.ts'
import { boundaryTenths } from '../hud/boundaryWarning.ts'
import { deathScreenKillerOf, killCardOf } from '../hud/killCards.ts'
import { killEntryOf } from '../hud/killfeed.ts'
import { medalLabels } from '../hud/medalFeed.ts'
import { scoreboardRows } from '../hud/scoreboardRows.ts'
import { sprintTankPercent } from '../hud/sprintTankReadout.ts'
import { ceilTenths } from '../hud/tenths.ts'

export interface ArenaReadoutOptions {
  readonly config: GameplayConfig
  readonly session: ArenaSession
  readonly hud: ArenaHud
  /** As teclas presas: o TAB, o VIEW do controle e o botão de toque escrevem `scoreboard`. */
  readonly keys: Readonly<HeldKeys>
  /** O retrato de cada id da sala (`portraitsOf`): a tela de morte e o cartão de abate. */
  readonly portraits: ReadonlyMap<string, string>
  /** A última entrada usada (`watchInputMethod.ts`): escolhe o texto da dica da lâmina. */
  readonly inputMethod: Readonly<InputMethodTracker>
}

/**
 * Leva o estado da sessão para o visor, **só quando ele muda**.
 *
 * O laço roda por quadro, mas quase nada escreve no dom: munição e fase só
 * mudam em tiro e recarga, o placar só em kill, e o relógio tem guarda de
 * segundo inteiro dentro do próprio hud. O aviso de fora da área escreve só
 * quando o décimo de segundo muda, e nada com o jogador dentro. É o que mantém a tela fora do
 * orçamento de quadro do render (nfr.md).
 *
 * **Registrada depois do passo da sessão**, e a ordem importa: `lastMedals` é
 * reaproveitado e `advance` o esvazia no começo do próprio quadro. O
 * `attachLocalCharacter` registra o `advance` antes desta ligação em
 * `babylonArenaRenderer.ts`, e é isso que faz a medalha chegar no quadro em
 * que foi ganha, e não no seguinte.
 *
 * ```ts
 * driveArenaReadouts(scene, { config, session, hud })
 * ```
 */
export function driveArenaReadouts(scene: Scene, options: ArenaReadoutOptions): void {
  const { config, session, hud } = options
  const last = createLastReadouts()
  const ranked: PlayerScore[] = []
  const bladeHint = createBladeHintWatch()
  scene.onBeforeRenderObservable.add(() => {
    writeBladeHint(hud, session, options.inputMethod.method, bladeHint)
    writeCallsign(hud, session, last)
    writeAmmo(hud, session, last)
    writeKillfeed(hud, session, options.portraits)
    writeScore(hud, session, last)
    writeScoreboard(hud, session, last, ranked)
    writeScoreboardOpen(hud, options.keys.scoreboard, last)
    writeDeathNotice(hud, session, last, options.portraits)
    writeBoundaryWarning(hud, session, last)
    writeGrapple(hud, session, last)
    writeSprintTank(hud, session, config, last)
    hud.setTimeLeft(config.match.durationS - session.matchTimeS)
  })
}

/**
 * A dica de volta à sniper, enquanto a lâmina está na mão de um jogador vivo:
 * morto, a lâmina só volta à bainha no respawn, e a dica na tela de morte
 * ensinaria um caminho que não leva a lugar nenhum. Com o tempo esgotado, também
 * não: a lâmina volta à bainha (`endMatch`), a entrada está travada, e a tela de
 * MVP ocupa o visor (ADR 0022).
 */
function writeBladeHint(
  hud: ArenaHud,
  session: ArenaSession,
  method: InputMethod,
  watch: BladeHintWatch,
): void {
  const drawn = session.melee.bladeDrawn && session.local.alive && !session.matchOver
  const hint = stepBladeHint(watch, drawn, method)
  if (hint !== undefined) hud.setBladeHint(hint)
}

/** Tudo em "nunca escrito": o primeiro quadro escreve cada campo uma vez. */
function createLastReadouts(): LastReadouts {
  return {
    ammo: -1,
    phase: '',
    kills: -1,
    streak: -1,
    points: 0,
    boundaryTenths: null,
    scoreboardRevision: -1,
    scoreboardOpen: false,
    killedBy: null,
    // o hud nasce com o gancho pronto e sem alcance (`createArenaHud`, e o
    // `data-grapple-reach` do index.html): é o que já está escrito.
    grappleTenths: 0,
    grappleReach: false,
    // o hud nasce com o tanque cheio, e o indicador apagado (`index.html`).
    sprintPercent: null,
    callsign: '',
  }
}

/** O que já está escrito na tela. Escrever de novo o mesmo valor é toque no dom à toa. */
interface LastReadouts {
  ammo: number
  phase: string
  kills: number
  streak: number
  points: number
  /** `null` de partida: o aviso nasce apagado no html, e apagá-lo de novo seria toque à toa. */
  boundaryTenths: number | null
  scoreboardRevision: number
  scoreboardOpen: boolean
  killedBy: string | null
  grappleTenths: number
  grappleReach: boolean
  sprintPercent: number | null
  callsign: string
}

/**
 * O nome de perfil, quando a partida o troca (`restartMatch`). O placar é
 * reescrito junto: a revisão dele não sobe com nome novo, e a linha do
 * jogador ficaria com o nome velho até a próxima kill.
 */
function writeCallsign(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const callsign = session.nameOf(LOCAL_PLAYER_ID)
  if (callsign === last.callsign) return
  last.callsign = callsign
  last.scoreboardRevision = -1
  hud.setCallsign(callsign)
}

/**
 * As linhas do placar, **só quando ele muda**: a revisão do núcleo sobe a
 * cada kill e a cada entrada, e é ela que se compara, e não os jogadores. O
 * placar fica pronto mesmo fechado — o quadro em que o TAB desce só troca um
 * atributo.
 */
function writeScoreboard(
  hud: ArenaHud,
  session: ArenaSession,
  last: LastReadouts,
  ranked: PlayerScore[],
): void {
  const { revision } = session.scoreboard
  if (revision === last.scoreboardRevision) return
  last.scoreboardRevision = revision
  rankedScores(session.scoreboard as Scoreboard, ranked)
  hud.setScoreboard(scoreboardRows(ranked, session.nameOf, LOCAL_PLAYER_ID))
}

function writeScoreboardOpen(hud: ArenaHud, open: boolean, last: LastReadouts): void {
  if (open === last.scoreboardOpen) return
  last.scoreboardOpen = open
  hud.setScoreboardOpen(open)
}

/**
 * A tela de morte, enquanto ele espera; apagada no respawn e no fim da partida
 * (`deathScreenKillerOf`). O cartão aloca, mas uma vez por morte, e não por quadro.
 */
function writeDeathNotice(
  hud: ArenaHud,
  session: ArenaSession,
  last: LastReadouts,
  portraits: ReadonlyMap<string, string>,
): void {
  const killer = deathScreenKillerOf(session)
  if (killer === last.killedBy) return
  last.killedBy = killer
  if (killer === null) {
    hud.setDeathNotice(null)
    return
  }
  hud.setDeathNotice(killCardOf(session.deathCause, session.nameOf(killer), portraits.get(killer)))
}

function writeAmmo(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const phase = weaponPhase(session.weapon)
  const ammo = session.weapon.roundsInMagazine
  if (ammo === last.ammo && phase === last.phase) return
  last.ammo = ammo
  last.phase = phase
  hud.setAmmo(ammo, phase)
}

/**
 * A recarga do gancho com guarda de décimo, no molde do aviso de fora da área:
 * o mostrador conta em décimos, e escrever a 60 Hz o mesmo décimo seria seis
 * toques no dom para nada. Engatado, a recarga está cheia e parada (`grapple.ts`
 * conta da soltura), e a guarda não escreve nada até soltar.
 */
function writeGrapple(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const remainingS = session.character.current.grappleCooldownLeftS
  const tenths = ceilTenths(remainingS)
  if (tenths !== last.grappleTenths) {
    last.grappleTenths = tenths
    hud.setGrapple(remainingS)
  }
  if (session.grappleInReach === last.grappleReach) return
  last.grappleReach = session.grappleInReach
  hud.setGrappleReach(session.grappleInReach)
}

/** O tanque da corrida plena, com guarda de inteiro: muda uma vez a cada 30 quadros. */
function writeSprintTank(
  hud: ArenaHud,
  session: ArenaSession,
  config: GameplayConfig,
  last: LastReadouts,
): void {
  const percent = sprintTankPercent(tacticalTankRatio(session.character.current, config))
  if (percent === last.sprintPercent) return
  last.sprintPercent = percent
  hud.setSprintTank(percent)
}

function writeBoundaryWarning(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const tenths = boundaryTenths(session.boundaryRemainingS)
  if (tenths === last.boundaryTenths) return
  last.boundaryTenths = tenths
  hud.setBoundaryWarning(session.boundaryRemainingS)
}

/**
 * A sequência também é guardada, e não só os abates: ela zera quando o jogador
 * local morre, sem abate nenhum mudar, e o registro de combate tem que ver.
 *
 * Os abates são os **do jogador**, e não os da partida: com bots, a partida
 * mata sem ele, e o registro de combate é dele.
 */
function writeScore(hud: ArenaHud, session: ArenaSession, last: LastReadouts): void {
  const local = session.scoreboard.players.get(LOCAL_PLAYER_ID)
  const kills = local?.kills ?? 0
  const points = local?.points ?? 0
  const streak = local?.streak ?? 0
  if (kills === last.kills && streak === last.streak && points === last.points) return
  // o primeiro quadro não é kill: é o placar nascendo em zero.
  if (last.kills >= 0 && kills > last.kills) announceKill(hud, session, points - last.points)
  last.kills = kills
  last.streak = streak
  last.points = points
  // as medalhas só mudam junto com uma kill, ou zeradas com o placar: a
  // guarda dos abates já as cobre.
  hud.setScore({ kills, streak, points, medals: local?.medals ?? 0 })
}

/**
 * A kill do jogador: hitmarker, os pontos na retícula e as medalhas.
 *
 * Os pontos vêm da **diferença no placar**, e não de `pointsPerKill`. Era uma
 * aposta quando foi escrito, e o dia chegou: as medalhas somam por cima da
 * kill e o número da retícula já sai certo daqui, sem ninguém mexer nele.
 *
 * O feed de medalhas não repete este número: no topo entra só o ícone e o nome,
 * e o registro — `+350` mais o que o rendeu — é este, na diagonal da retícula.
 */
function announceKill(hud: ArenaHud, session: ArenaSession, points: number): void {
  hud.showHitmarker()
  hud.showKillPoints(points, medalLabels(session.lastMedals))
  hud.pushMedals(session.lastMedals)
}

/**
 * Toda kill do quadro entra no killfeed — a do jogador, a que o matou e a de
 * um bot em outro bot, que é FFA. O registro do quadro é reaproveitado e só
 * vale até o próximo `advance`, e é por isso que esta ligação roda depois dele.
 *
 * A kill do jogador também ganha o cartão de abate; duas no mesmo quadro
 * mostram a última, porque o cartão troca, e não empilha.
 */
function writeKillfeed(
  hud: ArenaHud,
  session: ArenaSession,
  portraits: ReadonlyMap<string, string>,
): void {
  const kills = session.lastKills
  for (let index = 0; index < kills.count; index += 1) {
    const notice = kills.slots[index]
    if (!notice) continue
    hud.pushKill(killEntryOf(notice, session.nameOf))
    if (notice.shooterId !== LOCAL_PLAYER_ID || notice.victimId === LOCAL_PLAYER_ID) continue
    const victim = notice.victimId
    hud.showKillBanner(killCardOf(notice, session.nameOf(victim), portraits.get(victim)))
  }
}
